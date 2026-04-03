import { Injectable, Logger } from '@nestjs/common'
import { BettingTeamStats, BettingH2H, BettingFixture } from './api-football-betting.service'

/**
 * Scoring result for corners market
 */
export interface CornersScoringResult {
  fixtureId: number
  // Expected corners
  cornersExpected: number
  cornersExpected1H: number
  cornersAExpected: number
  cornersBExpected: number
  // Probabilities by line
  probByLine: Map<number, { over: number; under: number }>
  // First half probabilities
  prob1HByLine: Map<number, { over: number; under: number }>
  // Best line recommendation
  bestLine: number
  bestDirection: 'OVER' | 'UNDER'
  // Handicap analysis
  handicapLine: number
  // Adjustments applied
  adjustments: {
    locality: number
    form: number
    shots: number
    h2h: number
    matchup?: number      // v1.5.0
    favorite?: number     // v1.5.0
  }
  // v1.5.0: Matchup analysis
  matchupReason?: string | null
  // Quality metrics
  sampleSize: number
  dataQuality: 'high' | 'medium' | 'low'
  warnings: string[]
}

/**
 * v1.5.0: Matchup adjustment result
 */
interface MatchupAdjustmentResult {
  multiplier: number
  reason: string | null
}

/**
 * League average corners (empirical data)
 */
const LEAGUE_AVG_CORNERS: Record<number, number> = {
  88: 10.43, // Eredivisie
  78: 9.64, // Bundesliga
  39: 10.2, // Premier League
  140: 9.8, // La Liga
  135: 10.5, // Serie A
  61: 9.5, // Ligue 1
  94: 10.3, // Primeira Liga
  262: 9.0, // Liga MX
  253: 9.2, // MLS
}

/**
 * Shots baseline for combined shots
 */
const SHOTS_BASELINE = 24

/**
 * Minimum games required
 */
const MIN_GAMES_PLAYED = 8

/**
 * Standard corner lines to calculate
 */
const CORNER_LINES = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]
const CORNER_LINES_1H = [3.5, 4.5, 5.5]

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
 * v1.5.0: Calculate matchup tactical adjustment based on possession patterns
 *
 * - High possession team vs low block: MANY corners (constant attacking, clearances)
 * - Two pressing teams: FEWER corners (quick transitions, less siege)
 * - Balanced possession: neutral
 */
function calculateMatchupAdjustment(
  homePossession: number,
  awayPossession: number,
): MatchupAdjustmentResult {
  const possessionGap = homePossession - awayPossession

  // Case 1: Home dominates possession (>60%) vs low possession away (<42%)
  // = Home attacks constantly, away defends and clears → MANY corners
  if (homePossession > 60 && awayPossession < 42) {
    return { multiplier: 1.15, reason: 'POSSESSION_DOMINANCE' }
  }

  // Case 2: Possession gap > 15 points
  // = Clear dominance but less extreme
  if (possessionGap > 15) {
    return { multiplier: 1.08, reason: 'POSSESSION_GAP' }
  }

  // Case 3: Both teams with balanced possession 45-55%
  // = Even match, less siege-based corners
  if (homePossession > 45 && homePossession < 55 &&
      awayPossession > 45 && awayPossession < 55) {
    return { multiplier: 0.95, reason: 'BALANCED_POSSESSION' }
  }

  // Case 4: Away dominates possession (rare - top team visiting)
  if (awayPossession > 58 && homePossession < 44) {
    return { multiplier: 1.12, reason: 'AWAY_DOMINANCE' }
  }

  return { multiplier: 1.0, reason: null }
}

/**
 * v1.5.0: Maximum corners inflation from adjustments
 */
const MAX_CORNERS_INFLATION = 1.35

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
export class ScoringCornersService {
  private readonly logger = new Logger(ScoringCornersService.name)

  /**
   * Score a fixture for corners markets
   * Implements EXACT formulas from ALGORITMOS doc section 3
   *
   * v1.5.0 Updates:
   * - homeOdds1X2 for favorite multiplier
   * - Matchup tactical adjustment based on possession
   */
  scoreCorners(
    fixture: BettingFixture,
    teamAStats: BettingTeamStats,
    teamBStats: BettingTeamStats,
    h2h: BettingH2H | null,
    leagueId: number,
    homeOdds1X2: number | null = null, // v1.5.0
  ): CornersScoringResult {
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

    // Get league average corners
    const leagueAvgCorners = LEAGUE_AVG_CORNERS[leagueId] || 10.0

    // ================================================
    // STEP 1: Base expected corners (Section 3.2)
    // ================================================
    // Cross corners for vs corners against
    const cornersAExpected =
      (teamAStats.avg_corners_for + teamBStats.avg_corners_against) / 2
    const cornersBExpected =
      (teamBStats.avg_corners_for + teamAStats.avg_corners_against) / 2
    let cornersExpected = cornersAExpected + cornersBExpected

    // ================================================
    // STEP 2: Locality adjustment (weight: 10%)
    // ================================================
    // Team A is home, Team B is away
    const homeFactor =
      teamAStats.home_corners_total / Math.max(1, teamAStats.avg_corners_total)
    const awayFactor =
      teamBStats.away_corners_total / Math.max(1, teamBStats.avg_corners_total)
    const localityAdj =
      ((homeFactor + awayFactor) / 2 - 1.0) * cornersExpected * 0.1

    // ================================================
    // STEP 3: Form adjustment (weight: 15%)
    // ================================================
    const avgForm = (teamAStats.form_corners_5 + teamBStats.form_corners_5) / 2
    const formAdj = (avgForm - leagueAvgCorners) * 0.15

    // ================================================
    // STEP 4: Shots adjustment (weight: 10%)
    // ================================================
    const combinedShots = teamAStats.avg_shots + teamBStats.avg_shots
    const shotsAdj =
      ((combinedShots - SHOTS_BASELINE) / SHOTS_BASELINE) * cornersExpected * 0.1

    // ================================================
    // STEP 5: H2H adjustment (weight: 10%)
    // ================================================
    let h2hAdj = 0
    if (h2h && h2h.matches > 0 && h2h.avg_corners > 0) {
      h2hAdj = (h2h.avg_corners - cornersExpected) * 0.1
    }

    // ================================================
    // STEP 6 (v1.5.0): Matchup tactical adjustment
    // ================================================
    // Possession-based adjustment for corners
    const homePossession = teamAStats.avg_possession || 50
    const awayPossession = teamBStats.avg_possession || 50
    const matchupAdj = calculateMatchupAdjustment(homePossession, awayPossession)

    // ================================================
    // STEP 7 (v1.5.0): Favorite adjustment
    // ================================================
    // Heavy favorites generate more corners due to constant pressure
    let favoriteMultiplier = 1.0
    if (homeOdds1X2 && homeOdds1X2 > 0 && homeOdds1X2 < 1.35) {
      favoriteMultiplier = 1.10
    }

    // ================================================
    // FINAL: Expected corners
    // ================================================
    const baseCorners = cornersExpected + localityAdj + formAdj + shotsAdj + h2hAdj

    // Apply v1.5.0 multipliers with CAP
    const adjustedCorners = Math.min(
      baseCorners * matchupAdj.multiplier * favoriteMultiplier,
      baseCorners * MAX_CORNERS_INFLATION
    )
    cornersExpected = adjustedCorners

    // Log v1.5.0 adjustments
    if (matchupAdj.reason || favoriteMultiplier > 1.0) {
      this.logger.debug(
        `Corners v1.5.0 adjustments: matchup=${matchupAdj.reason || 'none'} (${matchupAdj.multiplier}x), ` +
        `favorite=${favoriteMultiplier}x - base ${baseCorners.toFixed(1)} → ${cornersExpected.toFixed(1)}`
      )
    }

    // Clamp between 6 and 16
    cornersExpected = Math.max(6.0, Math.min(16.0, cornersExpected))

    // ================================================
    // First half corners (Section 3.4)
    // ================================================
    // Empirical rule: ~44% of total corners fall in first half
    const cornersExpected1H = cornersExpected * 0.44

    // ================================================
    // Calculate probabilities for each line (Section 3.3)
    // ================================================
    const probByLine = new Map<number, { over: number; under: number }>()
    for (const line of CORNER_LINES) {
      const pOver = probOver(line, cornersExpected)
      probByLine.set(line, {
        over: Math.round(pOver * 1000) / 1000,
        under: Math.round((1 - pOver) * 1000) / 1000,
      })
    }

    // First half lines
    const prob1HByLine = new Map<number, { over: number; under: number }>()
    for (const line of CORNER_LINES_1H) {
      const pOver = probOver(line, cornersExpected1H)
      prob1HByLine.set(line, {
        over: Math.round(pOver * 1000) / 1000,
        under: Math.round((1 - pOver) * 1000) / 1000,
      })
    }

    // ================================================
    // Asian Handicap line (Section 3.5)
    // ================================================
    const handicapLine = cornersAExpected - cornersBExpected

    // ================================================
    // Find best line (closest to 50% probability)
    // ================================================
    let bestLine = 9.5
    let bestDirection: 'OVER' | 'UNDER' = 'OVER'
    let bestProb = 0

    for (const [line, probs] of probByLine.entries()) {
      // Prefer lines where we have edge (prob > 0.52 for over or under)
      if (probs.over > 0.52 && probs.over > bestProb) {
        bestLine = line
        bestDirection = 'OVER'
        bestProb = probs.over
      }
      if (probs.under > 0.52 && probs.under > bestProb) {
        bestLine = line
        bestDirection = 'UNDER'
        bestProb = probs.under
      }
    }

    // Warnings
    if (combinedShots < 18) {
      warnings.push(`Low combined shots: ${combinedShots.toFixed(1)} (baseline: ${SHOTS_BASELINE})`)
    }
    if (cornersExpected < 8) {
      warnings.push(`Low expected corners: ${cornersExpected.toFixed(1)}`)
    }

    this.logger.debug(
      `Scored corners ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ` +
        `Expected=${cornersExpected.toFixed(1)}, 1H=${cornersExpected1H.toFixed(1)}`
    )

    return {
      fixtureId: fixture.fixtureId,
      cornersExpected,
      cornersExpected1H,
      cornersAExpected,
      cornersBExpected,
      probByLine,
      prob1HByLine,
      bestLine,
      bestDirection,
      handicapLine,
      adjustments: {
        locality: Math.round(localityAdj * 100) / 100,
        form: Math.round(formAdj * 100) / 100,
        shots: Math.round(shotsAdj * 100) / 100,
        h2h: Math.round(h2hAdj * 100) / 100,
        // v1.5.0: New adjustments
        matchup: Math.round((matchupAdj.multiplier - 1) * cornersExpected * 100) / 100,
        favorite: Math.round((favoriteMultiplier - 1) * cornersExpected * 100) / 100,
      },
      // v1.5.0: Matchup reason for logging
      matchupReason: matchupAdj.reason,
      sampleSize: minGames,
      dataQuality,
      warnings,
    }
  }

  /**
   * Calculate edge for a specific corners line
   */
  calculateEdge(
    result: CornersScoringResult,
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
   * Calculate edge for first half corners
   */
  calculateEdge1H(
    result: CornersScoringResult,
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
   * Check if fixture meets minimum thresholds for corners betting
   */
  meetsThresholds(result: CornersScoringResult): {
    isCandidate: boolean
    reason: string
  } {
    if (result.sampleSize < MIN_GAMES_PLAYED) {
      return { isCandidate: false, reason: 'Insufficient sample size' }
    }

    if (result.dataQuality === 'low') {
      return { isCandidate: false, reason: 'Low data quality' }
    }

    // Check if any line has prob > 0.52
    let hasViableLine = false
    for (const [_, probs] of result.probByLine.entries()) {
      if (probs.over > 0.52 || probs.under > 0.52) {
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
    result: CornersScoringResult,
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
      { variable: 'Corners for vs against (crossed)', weight: '55%' },
      { variable: 'Form (last 5 matches)', weight: '15%' },
      { variable: 'Locality (home/away)', weight: '10%' },
      { variable: 'Shots per match', weight: '10%' },
      { variable: 'H2H corners', weight: '10%' },
    ]
  }

  private classifyConfidence(edge: number): 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE' {
    if (edge >= 0.1) return 'ALTA'
    if (edge >= 0.05) return 'MEDIA'
    if (edge >= 0.02) return 'BAJA'
    return 'SIN_VALUE'
  }
}
