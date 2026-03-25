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
  vigInfo?: VigInfo
  isStatisticallySignificant?: boolean
  marginOfError?: number
}

/**
 * VIG (Vigorish) information extracted from odds
 * Used to calculate true probabilities by removing bookmaker margin
 */
export interface VigInfo {
  totalImplied: number       // Sum of implied probabilities (e.g., 1.04)
  vigPercent: number         // VIG as percentage (e.g., 0.04 = 4%)
  trueProbOver: number       // True adjusted probability for Over
  trueProbUnder: number      // True adjusted probability for Under
  isValidMarket: boolean     // False if VIG > 10% (data error)
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
 * UPDATED: Adjusted for VIG-extracted probabilities (real edges, not inflated)
 * These are REAL edges after removing bookmaker margin
 */
const EDGE_THRESHOLDS = {
  ALTA: 0.08, // 8%+ edge - very strong (real, not inflated)
  MEDIA: 0.05, // 5-8% edge - solid
  BAJA: 0.03, // 3-5% edge - minimum acceptable
}

/**
 * Minimum edge to avoid statistical noise
 * Edges below this are likely within margin of error
 */
const MIN_SIGNIFICANT_EDGE = 0.02

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
   * Extract VIG (vigorish/margin) from bookmaker odds
   * Returns true probabilities by removing the bookmaker's edge
   *
   * Example:
   * - Odds Over 1.85, Under 2.00
   * - Naive prob: 54.1% + 50% = 104.1% (4.1% VIG)
   * - True prob Over: 54.1% / 104.1% = 51.9%
   */
  extractVig(oddsOver: number, oddsUnder: number): VigInfo {
    const naiveProbOver = 1 / oddsOver
    const naiveProbUnder = 1 / oddsUnder
    const totalImplied = naiveProbOver + naiveProbUnder
    const vigPercent = totalImplied - 1

    return {
      totalImplied,
      vigPercent,
      trueProbOver: naiveProbOver / totalImplied,
      trueProbUnder: naiveProbUnder / totalImplied,
      isValidMarket: vigPercent > 0 && vigPercent < 0.10,
    }
  }

  /**
   * Validate that the edge is statistically significant given sample size
   * Uses confidence interval to determine if edge exceeds margin of error
   *
   * @param probOwn Our calculated probability
   * @param probImplied Market implied probability (VIG-adjusted)
   * @param sampleSize Number of historical games used for calculation
   * @param confidenceLevel Z-score (1.645 = 90%, 1.96 = 95%)
   */
  isEdgeSignificant(
    probOwn: number,
    probImplied: number,
    sampleSize: number,
    confidenceLevel: number = 1.645 // 90% confidence
  ): { isSignificant: boolean; marginOfError: number } {
    // Require minimum sample size for any statistical validity
    if (sampleSize < 10) {
      return { isSignificant: false, marginOfError: 1 }
    }

    // Standard error of a proportion
    const stdError = Math.sqrt((probOwn * (1 - probOwn)) / sampleSize)
    const marginOfError = confidenceLevel * stdError
    const edge = probOwn - probImplied

    return {
      isSignificant: edge > marginOfError && edge > MIN_SIGNIFICANT_EDGE,
      marginOfError,
    }
  }

  /**
   * Detect value for goals 1H markets
   * Implements detect_value_goals from ALGORITMOS doc section 4.1
   *
   * @param scoringResult Scoring result with probabilities
   * @param market Market type
   * @param oddsDecimal Decimal odds for Over
   * @param bookmaker Bookmaker name
   * @param oddsOpposite Optional: Under odds for VIG calculation
   * @param sampleSize Optional: Sample size for significance testing
   */
  detectValueGoals(
    scoringResult: GoalsScoringResult,
    market: 'over_05_1h' | 'over_15_1h',
    oddsDecimal: number,
    bookmaker: string = 'unknown',
    oddsOpposite?: number,
    sampleSize?: number
  ): ValueResult {
    const probOwn =
      market === 'over_05_1h'
        ? scoringResult.probOver05_1H
        : scoringResult.probOver15_1H

    // Extract VIG and get true implied probability
    let probImplied: number
    let vigInfo: VigInfo | undefined

    if (oddsOpposite && oddsOpposite > 1) {
      // We have both odds - extract VIG properly
      vigInfo = this.extractVig(oddsDecimal, oddsOpposite)
      probImplied = vigInfo.trueProbOver
    } else {
      // Estimate VIG as typical 4% when opposite odds not available
      const estimatedVig = 0.04
      const naiveProb = 1 / oddsDecimal
      probImplied = naiveProb / (1 + estimatedVig)
      vigInfo = {
        totalImplied: 1 + estimatedVig,
        vigPercent: estimatedVig,
        trueProbOver: probImplied,
        trueProbUnder: 1 - probImplied,
        isValidMarket: true,
      }
    }

    // Calculate edge using VIG-adjusted probability
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

    // Check statistical significance if sample size provided
    let isStatisticallySignificant = true
    let marginOfError = 0
    if (sampleSize) {
      const significance = this.isEdgeSignificant(probOwn, probImplied, sampleSize)
      isStatisticallySignificant = significance.isSignificant
      marginOfError = significance.marginOfError

      // Downgrade confidence if edge is not statistically significant
      if (!isStatisticallySignificant && hasValue) {
        this.logger.debug(
          `Edge ${(edge * 100).toFixed(1)}% not significant (margin: ${(marginOfError * 100).toFixed(1)}%, n=${sampleSize})`
        )
        // Only allow in combos, not solo bets
        if (confidence === 'BAJA') {
          hasValue = false
          confidence = 'SIN_VALUE'
        } else if (confidence === 'ALTA') {
          confidence = 'MEDIA'
        } else if (confidence === 'MEDIA') {
          confidence = 'BAJA'
        }
      }
    }

    this.logger.debug(
      `Value detection ${market}: prob=${(probOwn * 100).toFixed(1)}%, ` +
        `implied=${(probImplied * 100).toFixed(1)}% (VIG=${(vigInfo?.vigPercent || 0) * 100}%), ` +
        `edge=${(edge * 100).toFixed(1)}%, confidence=${confidence}`
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
      vigInfo,
      isStatisticallySignificant,
      marginOfError,
    }
  }

  /**
   * Detect value for corners markets
   * Implements detect_value_corners from ALGORITMOS doc section 4.2
   *
   * @param scoringResult Corners scoring result with probabilities
   * @param line The line (e.g., 9.5, 10.5)
   * @param oddsOver Decimal odds for Over
   * @param oddsUnder Decimal odds for Under
   * @param bookmaker Bookmaker name
   * @param sampleSize Optional: Sample size for significance testing
   */
  detectValueCorners(
    scoringResult: CornersScoringResult,
    line: number,
    oddsOver: number,
    oddsUnder: number,
    bookmaker: string = 'unknown',
    sampleSize?: number
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

    // Extract VIG and get true implied probabilities
    const vigInfo = this.extractVig(oddsOver, oddsUnder)

    // Validate market VIG - if > 10%, likely data error
    if (!vigInfo.isValidMarket) {
      this.logger.warn(
        `Invalid corners market VIG ${(vigInfo.vigPercent * 100).toFixed(1)}% for line ${line}`
      )
    }

    // Calculate edges using VIG-adjusted probabilities
    const probImpliedOver = vigInfo.trueProbOver
    const probImpliedUnder = vigInfo.trueProbUnder

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

    // Check statistical significance if sample size provided
    let isStatisticallySignificant = true
    let marginOfError = 0
    if (sampleSize) {
      const significance = this.isEdgeSignificant(probOwn, probImplied, sampleSize)
      isStatisticallySignificant = significance.isSignificant
      marginOfError = significance.marginOfError

      // Downgrade confidence if edge is not statistically significant
      if (!isStatisticallySignificant && hasValue) {
        this.logger.debug(
          `Corners edge ${(edge * 100).toFixed(1)}% not significant (margin: ${(marginOfError * 100).toFixed(1)}%, n=${sampleSize})`
        )
        if (confidence === 'BAJA') {
          hasValue = false
          confidence = 'SIN_VALUE'
        } else if (confidence === 'ALTA') {
          confidence = 'MEDIA'
        } else if (confidence === 'MEDIA') {
          confidence = 'BAJA'
        }
      }
    }

    this.logger.debug(
      `Value detection corners ${line} ${direction}: ` +
        `prob=${(probOwn * 100).toFixed(1)}%, implied=${(probImplied * 100).toFixed(1)}% (VIG=${(vigInfo.vigPercent * 100).toFixed(1)}%), ` +
        `edge=${(edge * 100).toFixed(1)}%`
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
      vigInfo,
      isStatisticallySignificant,
      marginOfError,
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

    // Extract VIG and get true implied probabilities
    const vigInfo = this.extractVig(oddsHome, oddsAway)
    const probImpliedHome = vigInfo.trueProbOver
    const probImpliedAway = vigInfo.trueProbUnder

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
