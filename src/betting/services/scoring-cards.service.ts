import { Injectable, Logger } from '@nestjs/common'
import { BettingTeamStats, BettingH2H, BettingFixture } from './api-football-betting.service'
import { RefereeDataForScoring } from '../schemas/referee-stats.schema'

/**
 * v1.5.0 Weight Configuration
 *
 * Referee factor is the most important predictor of card totals.
 * Research shows referee style accounts for ~45% of variance in cards.
 *
 * When referee data is available:
 *   - Referee: 45%
 *   - Team cards: 30%
 *   - Form: 10%
 *   - Locality: 8%
 *   - H2H: 7%
 *
 * When referee data is NOT available (fallback):
 *   - Team cards: 65%
 *   - Form: 15%
 *   - Locality: 10%
 *   - H2H: 10%
 */
const WEIGHTS_WITH_REFEREE = {
  referee: 0.45,
  teamCards: 0.30,
  form: 0.10,
  locality: 0.08,
  h2h: 0.07,
}

const WEIGHTS_WITHOUT_REFEREE = {
  teamCards: 0.65,
  form: 0.15,
  locality: 0.10,
  h2h: 0.10,
}

/**
 * Scoring result for cards market
 */
export interface CardsScoringResult {
  fixtureId: number
  // Expected cards
  cardsExpected: number
  cardsExpected1H: number
  cardsAExpected: number
  cardsBExpected: number
  // Probabilities by line
  probByLine: Map<number, { over: number; under: number }>
  // First half probabilities
  prob1HByLine: Map<number, { over: number; under: number }>
  // Best line recommendation
  bestLine: number
  bestDirection: 'OVER' | 'UNDER'
  // Adjustments applied
  adjustments: {
    referee: number
    locality: number
    form: number
    h2h: number
  }
  // Referee info (v1.5.0)
  refereeUsed: boolean
  refereeName?: string
  refereeCardStyle?: string
  // Quality metrics
  sampleSize: number
  dataQuality: 'high' | 'medium' | 'low'
  warnings: string[]
}

/**
 * League average cards (empirical data - yellow cards per match)
 */
const LEAGUE_AVG_CARDS: Record<number, number> = {
  88: 3.8,   // Eredivisie
  78: 3.5,   // Bundesliga
  39: 3.2,   // Premier League
  140: 4.5,  // La Liga
  141: 4.8,  // La Liga 2
  135: 4.2,  // Serie A
  61: 3.6,   // Ligue 1
  94: 4.0,   // Primeira Liga
  262: 4.5,  // Liga MX
  253: 3.8,  // MLS
  40: 3.4,   // Championship
  41: 3.6,   // League One
  42: 3.8,   // League Two
  98: 3.0,   // J1 League
  239: 4.6,  // Liga BetPlay
}

/**
 * Minimum games required
 */
const MIN_GAMES_PLAYED = 8

/**
 * Standard card lines to calculate
 */
const CARD_LINES = [2.5, 3.5, 4.5, 5.5, 6.5]
const CARD_LINES_1H = [0.5, 1.5, 2.5]

/**
 * Poisson probability calculation
 */
function poissonProbability(k: number, lambda: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k)
}

function factorial(n: number): number {
  if (n <= 1) return 1
  let result = 1
  for (let i = 2; i <= n; i++) {
    result *= i
  }
  return result
}

/**
 * Calculate probability of Over X.5 using Poisson
 */
function probOver(line: number, expected: number): number {
  // Over X.5 means we need >= X+1
  const threshold = Math.floor(line) + 1
  let probUnder = 0
  for (let k = 0; k < threshold; k++) {
    probUnder += poissonProbability(k, expected)
  }
  return 1 - probUnder
}

@Injectable()
export class ScoringCardsService {
  private readonly logger = new Logger(ScoringCardsService.name)

  /**
   * Score a fixture for cards markets
   * Uses team card statistics, referee data, and historical data
   *
   * v1.5.0: Added referee parameter with 45% weight
   */
  scoreCards(
    fixture: BettingFixture,
    teamAStats: BettingTeamStats,
    teamBStats: BettingTeamStats,
    h2h: BettingH2H | null,
    leagueId: number,
    refereeData: RefereeDataForScoring | null = null
  ): CardsScoringResult {
    const warnings: string[] = []

    // Check sample size
    const minGames = Math.min(teamAStats.gamesPlayed, teamBStats.gamesPlayed)
    if (minGames < MIN_GAMES_PLAYED) {
      warnings.push(`Insufficient sample: ${minGames} games`)
    }

    // Data quality
    let dataQuality: 'high' | 'medium' | 'low' = 'high'
    if (minGames < 8) dataQuality = 'low'
    else if (minGames < 15) dataQuality = 'medium'

    // Get league average cards
    const leagueAvgCards = LEAGUE_AVG_CARDS[leagueId] || 4.0

    // Determine weights based on referee data availability
    const useRefereeWeights = refereeData !== null && refereeData.seasonMatches >= 5
    const weights = useRefereeWeights ? WEIGHTS_WITH_REFEREE : WEIGHTS_WITHOUT_REFEREE

    // ================================================
    // STEP 1: Base expected cards per team
    // ================================================
    // Team A cards = their cards received + opponent's cards drawn
    // This reflects: aggressive teams get more cards AND cause more cards
    const cardsAExpected = teamAStats.avg_cards_total || leagueAvgCards / 2
    const cardsBExpected = teamBStats.avg_cards_total || leagueAvgCards / 2
    const baseCardsExpected = cardsAExpected + cardsBExpected

    // ================================================
    // STEP 2: Referee adjustment (weight: 45% when available)
    // v1.5.0: Referee style is the strongest predictor
    // ================================================
    let refereeAdj = 0
    if (useRefereeWeights && refereeData) {
      // Compare referee avg to league avg
      const refereeDiff = refereeData.avgCardsPerMatch - leagueAvgCards
      // Scale the adjustment by referee weight (45%)
      refereeAdj = refereeDiff * WEIGHTS_WITH_REFEREE.referee

      this.logger.debug(
        `Referee ${refereeData.name} (${refereeData.cardStyle}): ` +
          `avg=${refereeData.avgCardsPerMatch.toFixed(1)}, ` +
          `leagueAvg=${leagueAvgCards.toFixed(1)}, adj=${refereeAdj.toFixed(2)}`
      )
    }

    // ================================================
    // STEP 3: Locality adjustment
    // ================================================
    // Home teams typically get slightly fewer cards
    // Away teams typically get slightly more cards
    const homeCardFactor = teamAStats.home_cards_total
      ? teamAStats.home_cards_total / Math.max(1, teamAStats.avg_cards_total || 1)
      : 0.95 // Default: home teams get 5% fewer cards
    const awayCardFactor = teamBStats.away_cards_total
      ? teamBStats.away_cards_total / Math.max(1, teamBStats.avg_cards_total || 1)
      : 1.05 // Default: away teams get 5% more cards

    const localityWeight = useRefereeWeights ? weights.locality : WEIGHTS_WITHOUT_REFEREE.locality
    const localityAdj = ((homeCardFactor + awayCardFactor) / 2 - 1.0) * baseCardsExpected * localityWeight

    // ================================================
    // STEP 4: Form adjustment
    // ================================================
    // Recent card trends
    const avgFormCards = (teamAStats.form_cards_5 || cardsAExpected) +
                         (teamBStats.form_cards_5 || cardsBExpected)
    const formWeight = useRefereeWeights ? weights.form : WEIGHTS_WITHOUT_REFEREE.form
    const formAdj = (avgFormCards - baseCardsExpected) * formWeight

    // ================================================
    // STEP 5: H2H adjustment
    // ================================================
    let h2hAdj = 0
    const h2hWeight = useRefereeWeights ? weights.h2h : WEIGHTS_WITHOUT_REFEREE.h2h
    if (h2h && h2h.matches > 0 && h2h.avg_cards && h2h.avg_cards > 0) {
      h2hAdj = (h2h.avg_cards - baseCardsExpected) * h2hWeight
    }

    // ================================================
    // FINAL: Expected cards
    // ================================================
    let cardsExpected = baseCardsExpected + refereeAdj + localityAdj + formAdj + h2hAdj

    // Clamp between 2 and 10
    cardsExpected = Math.max(2.0, Math.min(10.0, cardsExpected))

    // ================================================
    // First half cards
    // ================================================
    // Empirical rule: ~35-40% of cards fall in first half
    // Cards tend to be more frequent in second half due to fatigue/desperation
    const cardsExpected1H = cardsExpected * 0.38

    // ================================================
    // Calculate probabilities for each line
    // ================================================
    const probByLine = new Map<number, { over: number; under: number }>()
    for (const line of CARD_LINES) {
      const pOver = probOver(line, cardsExpected)
      probByLine.set(line, {
        over: Math.round(pOver * 1000) / 1000,
        under: Math.round((1 - pOver) * 1000) / 1000,
      })
    }

    // First half lines
    const prob1HByLine = new Map<number, { over: number; under: number }>()
    for (const line of CARD_LINES_1H) {
      const pOver = probOver(line, cardsExpected1H)
      prob1HByLine.set(line, {
        over: Math.round(pOver * 1000) / 1000,
        under: Math.round((1 - pOver) * 1000) / 1000,
      })
    }

    // ================================================
    // Find best line (highest edge potential)
    // ================================================
    let bestLine = 3.5
    let bestDirection: 'OVER' | 'UNDER' = 'OVER'
    let bestProb = 0

    for (const [line, probs] of probByLine.entries()) {
      if (probs.over > 0.55 && probs.over > bestProb) {
        bestLine = line
        bestDirection = 'OVER'
        bestProb = probs.over
      }
      if (probs.under > 0.55 && probs.under > bestProb) {
        bestLine = line
        bestDirection = 'UNDER'
        bestProb = probs.under
      }
    }

    // Warnings
    if (cardsExpected < 3) {
      warnings.push(`Low expected cards: ${cardsExpected.toFixed(1)} - teams may be disciplined`)
    }
    if (cardsExpected > 7) {
      warnings.push(`High expected cards: ${cardsExpected.toFixed(1)} - intense match expected`)
    }

    this.logger.debug(
      `Scored cards ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ` +
        `Expected=${cardsExpected.toFixed(1)}, 1H=${cardsExpected1H.toFixed(1)}` +
        (useRefereeWeights ? ` (referee: ${refereeData?.name})` : ' (no referee data)')
    )

    return {
      fixtureId: fixture.fixtureId,
      cardsExpected,
      cardsExpected1H,
      cardsAExpected,
      cardsBExpected,
      probByLine,
      prob1HByLine,
      bestLine,
      bestDirection,
      adjustments: {
        referee: Math.round(refereeAdj * 100) / 100,
        locality: Math.round(localityAdj * 100) / 100,
        form: Math.round(formAdj * 100) / 100,
        h2h: Math.round(h2hAdj * 100) / 100,
      },
      refereeUsed: useRefereeWeights,
      refereeName: refereeData?.name,
      refereeCardStyle: refereeData?.cardStyle,
      sampleSize: minGames,
      dataQuality,
      warnings,
    }
  }

  /**
   * Calculate edge for a specific cards line
   */
  calculateEdge(
    result: CardsScoringResult,
    line: number,
    oddsOver: number,
    oddsUnder: number
  ): {
    direction: 'OVER' | 'UNDER' | 'SKIP'
    edge: number
    confidence: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE'
    selectedOdds: number
  } {
    const probs = result.probByLine.get(line)
    if (!probs) {
      return { direction: 'SKIP', edge: 0, confidence: 'SIN_VALUE', selectedOdds: 0 }
    }

    const probImpliedOver = 1 / oddsOver
    const probImpliedUnder = 1 / oddsUnder

    const edgeOver = probs.over - probImpliedOver
    const edgeUnder = probs.under - probImpliedUnder

    // Choose direction with higher edge
    if (edgeOver > edgeUnder && edgeOver >= 0.05) {
      return {
        direction: 'OVER',
        edge: edgeOver,
        confidence: this.classifyConfidence(edgeOver),
        selectedOdds: oddsOver,
      }
    } else if (edgeUnder > edgeOver && edgeUnder >= 0.05) {
      return {
        direction: 'UNDER',
        edge: edgeUnder,
        confidence: this.classifyConfidence(edgeUnder),
        selectedOdds: oddsUnder,
      }
    } else {
      return { direction: 'SKIP', edge: 0, confidence: 'SIN_VALUE', selectedOdds: 0 }
    }
  }

  /**
   * Calculate edge for first half cards
   */
  calculateEdge1H(
    result: CardsScoringResult,
    line: number,
    oddsOver: number,
    oddsUnder: number
  ): {
    direction: 'OVER' | 'UNDER' | 'SKIP'
    edge: number
    confidence: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE'
    selectedOdds: number
  } {
    const probs = result.prob1HByLine.get(line)
    if (!probs) {
      return { direction: 'SKIP', edge: 0, confidence: 'SIN_VALUE', selectedOdds: 0 }
    }

    const probImpliedOver = 1 / oddsOver
    const probImpliedUnder = 1 / oddsUnder

    const edgeOver = probs.over - probImpliedOver
    const edgeUnder = probs.under - probImpliedUnder

    if (edgeOver > edgeUnder && edgeOver >= 0.05) {
      return {
        direction: 'OVER',
        edge: edgeOver,
        confidence: this.classifyConfidence(edgeOver),
        selectedOdds: oddsOver,
      }
    } else if (edgeUnder > edgeOver && edgeUnder >= 0.05) {
      return {
        direction: 'UNDER',
        edge: edgeUnder,
        confidence: this.classifyConfidence(edgeUnder),
        selectedOdds: oddsUnder,
      }
    } else {
      return { direction: 'SKIP', edge: 0, confidence: 'SIN_VALUE', selectedOdds: 0 }
    }
  }

  /**
   * Check if fixture meets minimum thresholds for cards betting
   */
  meetsThresholds(result: CardsScoringResult): {
    isCandidate: boolean
    reason: string
  } {
    if (result.sampleSize < MIN_GAMES_PLAYED) {
      return { isCandidate: false, reason: 'Insufficient sample size' }
    }

    if (result.dataQuality === 'low') {
      return { isCandidate: false, reason: 'Low data quality' }
    }

    // Check if any line has prob > 0.55
    let hasViableLine = false
    for (const [_, probs] of result.probByLine.entries()) {
      if (probs.over > 0.55 || probs.under > 0.55) {
        hasViableLine = true
        break
      }
    }

    if (!hasViableLine) {
      return { isCandidate: false, reason: 'No viable line found' }
    }

    return { isCandidate: true, reason: 'Meets all thresholds' }
  }

  /**
   * Get probability for specific line
   */
  getProbabilityForLine(
    result: CardsScoringResult,
    line: number,
    direction: 'OVER' | 'UNDER'
  ): number {
    const probs = result.probByLine.get(line)
    if (!probs) return 0
    return direction === 'OVER' ? probs.over : probs.under
  }

  /**
   * Get weight table for debugging
   * v1.5.0: Updated to show both with/without referee weights
   */
  getWeightTable(withReferee: boolean = false): { variable: string; weight: string }[] {
    if (withReferee) {
      return [
        { variable: 'Referee card style', weight: '45%' },
        { variable: 'Team cards average (combined)', weight: '30%' },
        { variable: 'Form (last 5 matches)', weight: '10%' },
        { variable: 'Locality (home/away)', weight: '8%' },
        { variable: 'H2H cards', weight: '7%' },
      ]
    }
    return [
      { variable: 'Team cards average (combined)', weight: '65%' },
      { variable: 'Form (last 5 matches)', weight: '15%' },
      { variable: 'Locality (home/away)', weight: '10%' },
      { variable: 'H2H cards', weight: '10%' },
    ]
  }

  private classifyConfidence(edge: number): 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE' {
    if (edge >= 0.1) return 'ALTA'
    if (edge >= 0.05) return 'MEDIA'
    if (edge >= 0.02) return 'BAJA'
    return 'SIN_VALUE'
  }
}
