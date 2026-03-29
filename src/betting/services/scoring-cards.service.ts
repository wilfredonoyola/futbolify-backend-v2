import { Injectable, Logger } from '@nestjs/common'
import { BettingTeamStats, BettingH2H, BettingFixture } from './api-football-betting.service'

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
    locality: number
    form: number
    h2h: number
  }
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
   * Uses team card statistics and historical data
   */
  scoreCards(
    fixture: BettingFixture,
    teamAStats: BettingTeamStats,
    teamBStats: BettingTeamStats,
    h2h: BettingH2H | null,
    leagueId: number
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

    // ================================================
    // STEP 1: Base expected cards per team
    // ================================================
    // Team A cards = their cards received + opponent's cards drawn
    // This reflects: aggressive teams get more cards AND cause more cards
    const cardsAExpected = teamAStats.avg_cards_total || leagueAvgCards / 2
    const cardsBExpected = teamBStats.avg_cards_total || leagueAvgCards / 2
    let cardsExpected = cardsAExpected + cardsBExpected

    // ================================================
    // STEP 2: Locality adjustment (weight: 10%)
    // ================================================
    // Home teams typically get slightly fewer cards
    // Away teams typically get slightly more cards
    const homeCardFactor = teamAStats.home_cards_total
      ? teamAStats.home_cards_total / Math.max(1, teamAStats.avg_cards_total || 1)
      : 0.95 // Default: home teams get 5% fewer cards
    const awayCardFactor = teamBStats.away_cards_total
      ? teamBStats.away_cards_total / Math.max(1, teamBStats.avg_cards_total || 1)
      : 1.05 // Default: away teams get 5% more cards

    const localityAdj = ((homeCardFactor + awayCardFactor) / 2 - 1.0) * cardsExpected * 0.1

    // ================================================
    // STEP 3: Form adjustment (weight: 15%)
    // ================================================
    // Recent card trends
    const avgFormCards = (teamAStats.form_cards_5 || cardsAExpected) +
                         (teamBStats.form_cards_5 || cardsBExpected)
    const formAdj = (avgFormCards - cardsExpected) * 0.15

    // ================================================
    // STEP 4: H2H adjustment (weight: 10%)
    // ================================================
    let h2hAdj = 0
    if (h2h && h2h.matches > 0 && h2h.avg_cards && h2h.avg_cards > 0) {
      h2hAdj = (h2h.avg_cards - cardsExpected) * 0.1
    }

    // ================================================
    // FINAL: Expected cards
    // ================================================
    cardsExpected = cardsExpected + localityAdj + formAdj + h2hAdj

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
        `Expected=${cardsExpected.toFixed(1)}, 1H=${cardsExpected1H.toFixed(1)}`
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
        locality: Math.round(localityAdj * 100) / 100,
        form: Math.round(formAdj * 100) / 100,
        h2h: Math.round(h2hAdj * 100) / 100,
      },
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
   */
  getWeightTable(): { variable: string; weight: string }[] {
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
