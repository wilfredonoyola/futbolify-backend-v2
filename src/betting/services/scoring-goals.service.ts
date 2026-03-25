import { Injectable, Logger } from '@nestjs/common'
import { BettingTeamStats, BettingH2H, BettingFixture } from './api-football-betting.service'

/**
 * Scoring result for goals 1H market
 */
export interface GoalsScoringResult {
  fixtureId: number
  // Probabilities
  probOver05_1H: number
  probOver15_1H: number
  // Expected goals
  expectedGoals1H: number
  // Form factors
  formScore: number
  h2hScore: number
  // Confidence metrics
  sampleSize: number
  dataQuality: 'high' | 'medium' | 'low'
  // Warnings
  warnings: string[]
}

/**
 * League tier bonuses for probability adjustment
 */
const LEAGUE_TIER_BONUS: Record<number, number> = {
  1: 0.02, // Tier 1: +2%
  2: 0.01, // Tier 2: +1%
  3: 0.0, // Tier 3: no adjustment
  4: -0.01, // Tier 4: -1%
}

/**
 * Minimum games required for reliable stats
 */
const MIN_GAMES_PLAYED = 8

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
 * Calculate probability of Over X using Poisson distribution
 */
function probOverPoisson(threshold: number, lambda: number): number {
  // P(X > threshold) = 1 - P(X <= threshold)
  let probUnder = 0
  for (let k = 0; k <= threshold; k++) {
    probUnder += poissonProbability(k, lambda)
  }
  return 1 - probUnder
}

@Injectable()
export class ScoringGoalsService {
  private readonly logger = new Logger(ScoringGoalsService.name)

  /**
   * Score a fixture for first half goals markets
   * Implements EXACT formulas from ALGORITMOS doc section 2
   */
  scoreGoals1H(
    fixture: BettingFixture,
    teamAStats: BettingTeamStats,
    teamBStats: BettingTeamStats,
    h2h: BettingH2H | null,
    leagueTier: number = 2
  ): GoalsScoringResult {
    const warnings: string[] = []

    // Check sample size
    const minGames = Math.min(teamAStats.gamesPlayed, teamBStats.gamesPlayed)
    if (minGames < MIN_GAMES_PLAYED) {
      warnings.push(`Insufficient sample: ${minGames} games (need ${MIN_GAMES_PLAYED})`)
    }

    // Determine data quality
    let dataQuality: 'high' | 'medium' | 'low' = 'high'
    if (minGames < 8) dataQuality = 'low'
    else if (minGames < 15) dataQuality = 'medium'

    // ================================================
    // OVER 0.5 1H CALCULATION (Section 2.2)
    // ================================================

    // Step 1: Base probability using CORRECT formula
    // P(Over 0.5) = 1 - P(Neither team scores) = 1 - (1-probA)(1-probB)
    // This is mathematically correct for "at least one goal" probability
    // Team A is home, Team B is away
    const probA = teamAStats.home_over05_1h
    const probB = teamBStats.away_over05_1h
    // CORRECT: Using complement rule instead of naive average
    // Before: (probA + probB) / 2 (incorrect - underestimates probability)
    // After: 1 - (1 - probA) * (1 - probB) (correct - proper probability)
    let probBase = 1 - (1 - probA) * (1 - probB)

    // Step 2: Form adjustment (weight: 15%)
    // form_goals_1h: how many of last 5 matches had a goal in 1H
    const formScore =
      (teamAStats.form_goals_1h + teamBStats.form_goals_1h) / 10 // 0.0 to 1.0
    const formAdjustment = (formScore - 0.6) * 0.15

    // Step 3: H2H adjustment (weight: 10%)
    let h2hScore = 0.7 // default
    let h2hAdjustment = 0
    if (h2h && h2h.matches > 0) {
      h2hScore = h2h.last_5_goals_1h / 5 // 0.0 to 1.0
      h2hAdjustment = (h2hScore - 0.7) * 0.1
    }

    // Step 4: League tier adjustment (weight: 5%)
    const leagueAdjustment = LEAGUE_TIER_BONUS[leagueTier] || 0

    // Final probability Over 0.5 1H
    let probOver05_1H = probBase + formAdjustment + h2hAdjustment + leagueAdjustment

    // Clamp between 0.50 and 0.99
    probOver05_1H = Math.max(0.5, Math.min(0.99, probOver05_1H))

    // ================================================
    // OVER 1.5 1H CALCULATION (Section 2.2 - Poisson)
    // ================================================

    // Calculate expected goals 1H using Poisson model
    // lambda = (team_a.avg_goals_1h + team_b.avg_conceded_1h + team_b.avg_goals_1h + team_a.avg_conceded_1h) / 2
    const expectedGoals1H =
      (teamAStats.avg_goals_1h +
        teamBStats.avg_conceded_1h +
        teamBStats.avg_goals_1h +
        teamAStats.avg_conceded_1h) /
      2

    // Poisson: P(X >= 2) = 1 - P(X=0) - P(X=1)
    const lambda = expectedGoals1H
    const p0 = Math.exp(-lambda)
    const p1 = lambda * Math.exp(-lambda)
    let probOver15_1H = 1 - p0 - p1

    // Apply form and H2H adjustments (reduced weight for Over 1.5)
    const formAdj15 = (formScore - 0.6) * 0.1
    const h2hAdj15 = (h2hScore - 0.7) * 0.05
    probOver15_1H = probOver15_1H + formAdj15 + h2hAdj15

    // ================================================
    // BTS 1H FILTER (SOFT SCALING for Over 1.5)
    // ================================================
    // Instead of hard cutoff at 25%, use logistic function for smooth transition
    // This avoids "cliff effect" where 24.9% BTS = 0 probability
    const combinedBts1H = (teamAStats.bts_1h_pct + teamBStats.bts_1h_pct) / 2

    // Logistic scaling parameters
    const BTS_MIDPOINT = 0.25 // 50% factor at this BTS value
    const BTS_STEEPNESS = 15 // How sharp the transition is

    // Calculate BTS factor using logistic function
    // Factor results:
    // - BTS 40%: factor ≈ 0.98 (almost no effect)
    // - BTS 25%: factor = 0.50 (50% reduction)
    // - BTS 15%: factor ≈ 0.18 (82% reduction)
    // - BTS 10%: factor ≈ 0.08 (92% reduction)
    const btsFactor = 1 / (1 + Math.exp(-BTS_STEEPNESS * (combinedBts1H - BTS_MIDPOINT)))
    const originalProbOver15_1H = probOver15_1H
    probOver15_1H = probOver15_1H * btsFactor

    // Add warning if significant reduction applied
    if (btsFactor < 0.7) {
      warnings.push(
        `BTS 1H scaling: ${(combinedBts1H * 100).toFixed(1)}% → factor ${btsFactor.toFixed(2)} ` +
        `(${(originalProbOver15_1H * 100).toFixed(1)}% → ${(probOver15_1H * 100).toFixed(1)}%)`
      )
    }

    // Clamp probOver15_1H
    probOver15_1H = Math.max(0, Math.min(0.85, probOver15_1H))

    // ================================================
    // CONSISTENCY VERIFICATION
    // ================================================
    // Mathematical constraint: P(Over 1.5) <= P(Over 0.5)
    // If 2+ goals happen, at least 1 goal must have happened
    if (probOver15_1H > probOver05_1H) {
      warnings.push(
        `Consistency violation: O15 (${(probOver15_1H * 100).toFixed(1)}%) > O05 (${(probOver05_1H * 100).toFixed(1)}%)`
      )
      // Apply conservative correction: O15 = O05 * 0.85
      probOver15_1H = probOver05_1H * 0.85
      this.logger.warn(
        `Corrected O15 to ${(probOver15_1H * 100).toFixed(1)}% (was > O05)`
      )
    }

    // Additional warnings
    if (teamAStats.failed_to_score_pct > 0.3) {
      warnings.push(`Team A fails to score in ${(teamAStats.failed_to_score_pct * 100).toFixed(0)}% of matches`)
    }
    if (teamBStats.failed_to_score_pct > 0.3) {
      warnings.push(`Team B fails to score in ${(teamBStats.failed_to_score_pct * 100).toFixed(0)}% of matches`)
    }

    this.logger.debug(
      `Scored ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ` +
        `O05=${(probOver05_1H * 100).toFixed(1)}%, O15=${(probOver15_1H * 100).toFixed(1)}%`
    )

    return {
      fixtureId: fixture.fixtureId,
      probOver05_1H,
      probOver15_1H,
      expectedGoals1H,
      formScore,
      h2hScore,
      sampleSize: minGames,
      dataQuality,
      warnings,
    }
  }

  /**
   * Calculate edge for Over 0.5 1H market
   */
  calculateEdgeOver05(result: GoalsScoringResult, odds: number): {
    hasValue: boolean
    edge: number
    confidence: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE'
  } {
    const probImplied = 1 / odds
    const edge = result.probOver05_1H - probImplied

    if (edge >= 0.1) {
      return { hasValue: true, edge, confidence: 'ALTA' }
    } else if (edge >= 0.05) {
      return { hasValue: true, edge, confidence: 'MEDIA' }
    } else if (edge >= 0.02) {
      return { hasValue: true, edge, confidence: 'BAJA' }
    } else {
      return { hasValue: false, edge, confidence: 'SIN_VALUE' }
    }
  }

  /**
   * Calculate edge for Over 1.5 1H market
   */
  calculateEdgeOver15(result: GoalsScoringResult, odds: number): {
    hasValue: boolean
    edge: number
    confidence: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE'
  } {
    // Over 1.5 requires BTS filter to pass
    if (result.probOver15_1H === 0) {
      return { hasValue: false, edge: -1, confidence: 'SIN_VALUE' }
    }

    const probImplied = 1 / odds
    const edge = result.probOver15_1H - probImplied

    if (edge >= 0.1) {
      return { hasValue: true, edge, confidence: 'ALTA' }
    } else if (edge >= 0.05) {
      return { hasValue: true, edge, confidence: 'MEDIA' }
    } else if (edge >= 0.02) {
      return { hasValue: true, edge, confidence: 'BAJA' }
    } else {
      return { hasValue: false, edge, confidence: 'SIN_VALUE' }
    }
  }

  /**
   * Check if fixture passes minimum thresholds for goals 1H betting
   */
  meetsThresholds(result: GoalsScoringResult): {
    over05Candidate: boolean
    over05Strong: boolean
    over15Candidate: boolean
    over15Strong: boolean
  } {
    return {
      over05Candidate: result.probOver05_1H > 0.78 && result.sampleSize >= MIN_GAMES_PLAYED,
      over05Strong: result.probOver05_1H > 0.85 && result.sampleSize >= MIN_GAMES_PLAYED,
      over15Candidate: result.probOver15_1H > 0.4 && result.sampleSize >= MIN_GAMES_PLAYED,
      over15Strong: result.probOver15_1H > 0.5 && result.sampleSize >= MIN_GAMES_PLAYED,
    }
  }

  /**
   * Get weight table for debugging
   */
  getWeightTable(): { variable: string; weightOver05: string; weightOver15: string }[] {
    return [
      { variable: 'Over 0.5 1H % (home/away)', weightOver05: '70%', weightOver15: '40%' },
      { variable: 'Avg goals 1H (Poisson)', weightOver05: '0%', weightOver15: '35%' },
      { variable: 'Form (last 5 matches)', weightOver05: '15%', weightOver15: '10%' },
      { variable: 'H2H goals 1H', weightOver05: '10%', weightOver15: '5%' },
      { variable: 'League tier bonus', weightOver05: '5%', weightOver15: '5%' },
      { variable: 'BTS 1H % filter', weightOver05: 'N/A', weightOver15: '5% + mandatory' },
    ]
  }
}
