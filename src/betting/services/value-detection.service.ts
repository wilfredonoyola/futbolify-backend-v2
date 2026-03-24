import { Injectable, Logger } from '@nestjs/common'
import { GoalsScoringResult } from './scoring-goals.service'
import { CornersScoringResult } from './scoring-corners.service'
import { NormalizedOdds } from './odds-api.service'
import { BettingOdds, BookmakerOdds } from './api-football-betting.service'

/**
 * Value detection result
 */
export interface ValueResult {
  hasValue: boolean
  edge: number
  edgePercent: string
  confidence: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE'
  probOwn: number
  probImplied: number
  bestOdds: number
  bestBookmaker: string
  pinnacleOdds?: number
  edgeVsPinnacle?: number
  market: string
  direction: 'OVER' | 'UNDER'
  line?: number
}

/**
 * Multi-bookmaker comparison result
 */
export interface BestOddsResult {
  bestOdds: number
  bestBookmaker: string
  pinnacleOdds: number | null
  edgeVsPinnacle: number
  allBookmakers: Array<{
    name: string
    odds: number
  }>
}

/**
 * Minimum edge thresholds
 * UPDATED: Increased minimum to 5% for more conservative betting
 */
const EDGE_THRESHOLDS = {
  ALTA: 0.12, // 12%+ edge - very strong
  MEDIA: 0.08, // 8-12% edge - solid
  BAJA: 0.05, // 5-8% edge - minimum acceptable
}

/**
 * Minimum probability thresholds
 * UPDATED:
 * - Reduced Over 0.5 1H from 78% to 65% (allows finding value in this market)
 * - Increased Over 1.5 1H from 40% to 55% (avoids "coin flip" bets)
 */
const PROB_THRESHOLDS = {
  OVER_05_1H: 0.65, // Reduced: 65% min probability (was 78%)
  OVER_15_1H: 0.55, // Increased: 55% min probability (was 40%)
  CORNERS: 0.55, // Slightly increased from 52%
}

@Injectable()
export class ValueDetectionService {
  private readonly logger = new Logger(ValueDetectionService.name)

  /**
   * Detect value for goals 1H markets
   * Implements detect_value_goals from ALGORITMOS doc section 4.1
   */
  detectValueGoals(
    scoringResult: GoalsScoringResult,
    market: 'over_05_1h' | 'over_15_1h',
    oddsDecimal: number,
    bookmaker: string = 'unknown'
  ): ValueResult {
    const probOwn =
      market === 'over_05_1h'
        ? scoringResult.probOver05_1H
        : scoringResult.probOver15_1H

    // Implied probability from odds
    const probImplied = 1 / oddsDecimal

    // Calculate edge
    const edge = probOwn - probImplied

    // Classify confidence
    let confidence: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE' = 'SIN_VALUE'
    let hasValue = false

    if (edge >= EDGE_THRESHOLDS.ALTA) {
      confidence = 'ALTA'
      hasValue = true
    } else if (edge >= EDGE_THRESHOLDS.MEDIA) {
      confidence = 'MEDIA'
      hasValue = true
    } else if (edge >= EDGE_THRESHOLDS.BAJA) {
      confidence = 'BAJA'
      hasValue = true
    }

    // Check minimum probability threshold
    const minProb =
      market === 'over_05_1h'
        ? PROB_THRESHOLDS.OVER_05_1H
        : PROB_THRESHOLDS.OVER_15_1H

    if (probOwn < minProb) {
      hasValue = false
      confidence = 'SIN_VALUE'
    }

    // Special case: Over 1.5 1H with BTS filter failed
    if (market === 'over_15_1h' && probOwn === 0) {
      hasValue = false
      confidence = 'SIN_VALUE'
    }

    this.logger.debug(
      `Value detection ${market}: prob=${(probOwn * 100).toFixed(1)}%, ` +
        `implied=${(probImplied * 100).toFixed(1)}%, edge=${(edge * 100).toFixed(1)}%, ` +
        `confidence=${confidence}`
    )

    return {
      hasValue,
      edge,
      edgePercent: `${(edge * 100).toFixed(1)}%`,
      confidence,
      probOwn,
      probImplied,
      bestOdds: oddsDecimal,
      bestBookmaker: bookmaker,
      market,
      direction: 'OVER',
    }
  }

  /**
   * Detect value for corners markets
   * Implements detect_value_corners from ALGORITMOS doc section 4.2
   */
  detectValueCorners(
    scoringResult: CornersScoringResult,
    line: number,
    oddsOver: number,
    oddsUnder: number,
    bookmaker: string = 'unknown'
  ): ValueResult {
    // Get our probabilities for this line
    const probs = scoringResult.probByLine.get(line)

    if (!probs) {
      return {
        hasValue: false,
        edge: 0,
        edgePercent: '0%',
        confidence: 'SIN_VALUE',
        probOwn: 0,
        probImplied: 0,
        bestOdds: 0,
        bestBookmaker: bookmaker,
        market: `over_${line}_corners`,
        direction: 'OVER',
        line,
      }
    }

    // Calculate edges for both directions
    const probImpliedOver = 1 / oddsOver
    const probImpliedUnder = 1 / oddsUnder

    const edgeOver = probs.over - probImpliedOver
    const edgeUnder = probs.under - probImpliedUnder

    // Choose direction with higher edge
    let direction: 'OVER' | 'UNDER'
    let edge: number
    let probOwn: number
    let probImplied: number
    let bestOdds: number

    if (edgeOver > edgeUnder) {
      direction = 'OVER'
      edge = edgeOver
      probOwn = probs.over
      probImplied = probImpliedOver
      bestOdds = oddsOver
    } else {
      direction = 'UNDER'
      edge = edgeUnder
      probOwn = probs.under
      probImplied = probImpliedUnder
      bestOdds = oddsUnder
    }

    // Classify confidence
    let confidence: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE' = 'SIN_VALUE'
    let hasValue = false

    if (edge >= EDGE_THRESHOLDS.ALTA) {
      confidence = 'ALTA'
      hasValue = true
    } else if (edge >= EDGE_THRESHOLDS.MEDIA) {
      confidence = 'MEDIA'
      hasValue = true
    } else if (edge >= EDGE_THRESHOLDS.BAJA) {
      confidence = 'BAJA'
      hasValue = true
    }

    // Check minimum probability threshold
    if (probOwn < PROB_THRESHOLDS.CORNERS) {
      hasValue = false
      confidence = 'SIN_VALUE'
    }

    this.logger.debug(
      `Value detection corners ${line} ${direction}: ` +
        `prob=${(probOwn * 100).toFixed(1)}%, edge=${(edge * 100).toFixed(1)}%`
    )

    return {
      hasValue,
      edge,
      edgePercent: `${(edge * 100).toFixed(1)}%`,
      confidence,
      probOwn,
      probImplied,
      bestOdds,
      bestBookmaker: bookmaker,
      market: `${direction.toLowerCase()}_${line}_corners`,
      direction,
      line,
    }
  }

  /**
   * Find best odds across multiple bookmakers
   * Implements find_best_odds from ALGORITMOS doc section 4.3
   */
  findBestOdds(
    bettingOdds: BettingOdds,
    marketName: string,
    direction: 'OVER' | 'UNDER' | string
  ): BestOddsResult {
    let bestOdds = 0
    let bestBookmaker = ''
    let pinnacleOdds: number | null = null
    const allBookmakers: Array<{ name: string; odds: number }> = []

    for (const bookmaker of bettingOdds.bookmakers) {
      for (const market of bookmaker.markets) {
        // Match market name (flexible matching)
        const marketMatches =
          market.marketName.toLowerCase().includes(marketName.toLowerCase()) ||
          marketName.toLowerCase().includes(market.marketName.toLowerCase())

        if (!marketMatches) continue

        for (const value of market.values) {
          // Match direction
          const valueMatches =
            value.name.toLowerCase().includes(direction.toLowerCase()) ||
            direction.toLowerCase().includes(value.name.toLowerCase())

          if (!valueMatches) continue

          allBookmakers.push({
            name: bookmaker.bookmakerName,
            odds: value.odds,
          })

          // Track best odds
          if (value.odds > bestOdds) {
            bestOdds = value.odds
            bestBookmaker = bookmaker.bookmakerName
          }

          // Track Pinnacle as sharp reference
          if (
            bookmaker.bookmakerName.toLowerCase().includes('pinnacle') ||
            bookmaker.bookmakerId === 2 // Pinnacle ID in API-Football
          ) {
            pinnacleOdds = value.odds
          }
        }
      }
    }

    // Calculate edge vs Pinnacle
    let edgeVsPinnacle = 0
    if (pinnacleOdds && bestOdds) {
      const pinnacleProb = 1 / pinnacleOdds
      const bestProb = 1 / bestOdds
      edgeVsPinnacle = pinnacleProb - bestProb
    }

    return {
      bestOdds,
      bestBookmaker,
      pinnacleOdds,
      edgeVsPinnacle,
      allBookmakers,
    }
  }

  /**
   * Find best odds from The Odds API normalized format
   */
  findBestOddsNormalized(
    normalizedOdds: NormalizedOdds,
    direction: 'OVER' | 'UNDER'
  ): BestOddsResult {
    const best =
      direction === 'OVER' ? normalizedOdds.bestOver : normalizedOdds.bestUnder
    const pinnacle =
      direction === 'OVER'
        ? normalizedOdds.pinnacleOver
        : normalizedOdds.pinnacleUnder

    const allBookmakers = normalizedOdds.allBookmakers.map((bk) => ({
      name: bk.bookmaker,
      odds: direction === 'OVER' ? bk.over : bk.under,
    }))

    let edgeVsPinnacle = 0
    if (pinnacle && best) {
      const pinnacleProb = 1 / pinnacle
      const bestProb = 1 / best.price
      edgeVsPinnacle = pinnacleProb - bestProb
    }

    return {
      bestOdds: best?.price || 0,
      bestBookmaker: best?.bookmaker || '',
      pinnacleOdds: pinnacle || null,
      edgeVsPinnacle,
      allBookmakers,
    }
  }

  /**
   * Enhance value result with Pinnacle comparison
   */
  enhanceWithPinnacle(
    valueResult: ValueResult,
    pinnacleOdds: number
  ): ValueResult {
    const edgeVsPinnacle = 1 / pinnacleOdds - 1 / valueResult.bestOdds

    return {
      ...valueResult,
      pinnacleOdds,
      edgeVsPinnacle,
    }
  }

  /**
   * Get decision table recommendation
   * Based on ALGORITMOS doc section 4.4
   */
  getDecision(
    valueResult: ValueResult,
    bankroll: number
  ): {
    action: 'APOSTAR' | 'SOLO_COMBINADA' | 'SKIP'
    stakePercent: number
    reason: string
  } {
    if (!valueResult.hasValue) {
      return {
        action: 'SKIP',
        stakePercent: 0,
        reason: `Edge ${valueResult.edgePercent} below minimum`,
      }
    }

    // High probability + high edge
    if (valueResult.probOwn > 0.85 && valueResult.edge >= 0.1) {
      return {
        action: 'APOSTAR',
        stakePercent: 2.5,
        reason: 'High prob + high edge: strong bet',
      }
    }

    // Good probability + medium-high edge
    if (valueResult.probOwn > 0.8 && valueResult.edge >= 0.05) {
      return {
        action: 'APOSTAR',
        stakePercent: 1.5,
        reason: 'Good prob + edge: standard bet',
      }
    }

    // Decent probability + edge
    if (valueResult.probOwn > 0.75 && valueResult.edge >= 0.05) {
      return {
        action: 'APOSTAR',
        stakePercent: 1.0,
        reason: 'Decent prob + edge: small bet',
      }
    }

    // Low edge - only use in combos
    if (valueResult.probOwn > 0.75 && valueResult.edge >= 0.02) {
      return {
        action: 'SOLO_COMBINADA',
        stakePercent: 0,
        reason: 'Low edge: only use in correlated combos',
      }
    }

    return {
      action: 'SKIP',
      stakePercent: 0,
      reason: 'Does not meet betting criteria',
    }
  }

  /**
   * Batch detect value for all available lines
   */
  detectAllCornersValue(
    scoringResult: CornersScoringResult,
    odds: Map<number, { over: number; under: number }>,
    bookmaker: string = 'unknown'
  ): ValueResult[] {
    const results: ValueResult[] = []

    for (const [line, lineOdds] of odds.entries()) {
      const result = this.detectValueCorners(
        scoringResult,
        line,
        lineOdds.over,
        lineOdds.under,
        bookmaker
      )

      if (result.hasValue) {
        results.push(result)
      }
    }

    // Sort by edge descending
    results.sort((a, b) => b.edge - a.edge)

    return results
  }

  /**
   * Detect value for Asian Corners Handicap market
   * Per documento maestro sección 3.4:
   * - Teams with big difference in corners for vs against
   * - Houses sometimes don't adjust handicap well for matchup
   */
  detectValueCornersHandicap(
    scoringResult: CornersScoringResult,
    bookmakerHandicapLine: number,
    oddsHome: number,
    oddsAway: number,
    bookmaker: string = 'unknown'
  ): ValueResult {
    // Our expected handicap: Team A corners - Team B corners
    const expectedHandicap = scoringResult.handicapLine

    // The bookmaker's line is for Team A (home)
    // If bookmaker line is -1.5, they expect home team to have 1.5 fewer corners
    // If our expected handicap is +2.0, there's value on home team

    // Calculate probability using normal distribution approximation
    // Standard deviation for corners handicap is approximately 3.5
    const stdDev = 3.5

    // Probability that actual handicap > bookmaker line (home covers)
    const zScore = (expectedHandicap - bookmakerHandicapLine) / stdDev
    const probHomeCover = this.normalCDF(zScore)
    const probAwayCover = 1 - probHomeCover

    // Calculate edges
    const probImpliedHome = 1 / oddsHome
    const probImpliedAway = 1 / oddsAway

    const edgeHome = probHomeCover - probImpliedHome
    const edgeAway = probAwayCover - probImpliedAway

    // Choose the side with higher edge
    let direction: 'OVER' | 'UNDER'
    let edge: number
    let probOwn: number
    let probImplied: number
    let bestOdds: number

    if (edgeHome > edgeAway) {
      direction = 'OVER' // Home team to cover handicap
      edge = edgeHome
      probOwn = probHomeCover
      probImplied = probImpliedHome
      bestOdds = oddsHome
    } else {
      direction = 'UNDER' // Away team to cover handicap
      edge = edgeAway
      probOwn = probAwayCover
      probImplied = probImpliedAway
      bestOdds = oddsAway
    }

    // Classify confidence
    let confidence: 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_VALUE' = 'SIN_VALUE'
    let hasValue = false

    // Handicap requires higher edge threshold (more variance)
    if (edge >= 0.12) {
      confidence = 'ALTA'
      hasValue = true
    } else if (edge >= 0.08) {
      confidence = 'MEDIA'
      hasValue = true
    } else if (edge >= 0.05) {
      confidence = 'BAJA'
      hasValue = true
    }

    // Extra filter: significant expected handicap difference
    const handicapDiff = Math.abs(expectedHandicap - bookmakerHandicapLine)
    if (handicapDiff < 1.0) {
      // If our line is too close to bookmaker's, not enough edge
      hasValue = false
      confidence = 'SIN_VALUE'
    }

    this.logger.debug(
      `Value detection corners handicap: ` +
        `expected=${expectedHandicap.toFixed(1)}, bookmaker=${bookmakerHandicapLine}, ` +
        `direction=${direction}, edge=${(edge * 100).toFixed(1)}%`
    )

    return {
      hasValue,
      edge,
      edgePercent: `${(edge * 100).toFixed(1)}%`,
      confidence,
      probOwn,
      probImplied,
      bestOdds,
      bestBookmaker: bookmaker,
      market: 'corners_handicap',
      direction,
      line: bookmakerHandicapLine,
    }
  }

  /**
   * Standard normal CDF approximation
   */
  private normalCDF(z: number): number {
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911

    const sign = z < 0 ? -1 : 1
    z = Math.abs(z) / Math.sqrt(2)

    const t = 1.0 / (1.0 + p * z)
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z)

    return 0.5 * (1.0 + sign * y)
  }
}
