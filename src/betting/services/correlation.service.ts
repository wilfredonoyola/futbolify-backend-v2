import { Injectable, Logger } from '@nestjs/common'
import { BettingTeamStats, BettingFixture } from './api-football-betting.service'
import { MarketType } from '../enums/betting.enums'

/**
 * Correlation calculation result
 */
export interface CorrelationResult {
  baseCorrelation: number
  dynamicCorrelation: number
  adjustments: CorrelationAdjustment[]
  finalCorrelation: number
}

/**
 * Individual correlation adjustment
 */
export interface CorrelationAdjustment {
  factor: string
  value: number
  reason: string
}

/**
 * Base correlation matrix between markets (same match)
 * From COMBINADAS doc section 1.2
 *
 * Updated v1.3.0: Added BTTS 1H and Cards markets
 *
 * Correlation logic:
 * - Goals + BTTS: High (0.65) - both require attacking play
 * - Goals + Corners: Medium (0.35) - attacking creates corners
 * - Goals + Cards: Low (0.25) - open games may have fewer fouls
 * - Corners + Cards: Medium-High (0.45) - pressing = corners + fouls
 * - BTTS + Corners: Medium (0.40) - both teams attacking
 * - BTTS + Cards: Medium (0.30) - competitive matches
 */
const CORRELATION_MATRIX: Record<string, Record<string, number>> = {
  // Goals markets
  OVER_05_1H: {
    OVER_05_1H: 1.0,
    OVER_15_1H: 0.65,
    BTTS_1H: 0.55,
    OVER_95_CORNERS: 0.35,
    OVER_45_CORNERS_1H: 0.4,
    CORNERS_HANDICAP: 0.15,
    OVER_35_CARDS: 0.25,
    OVER_45_CARDS: 0.25,
  },
  OVER_15_1H: {
    OVER_05_1H: 0.65,
    OVER_15_1H: 1.0,
    BTTS_1H: 0.70,
    OVER_95_CORNERS: 0.45,
    OVER_45_CORNERS_1H: 0.5,
    CORNERS_HANDICAP: 0.2,
    OVER_35_CARDS: 0.30,
    OVER_45_CARDS: 0.30,
  },
  // BTTS 1H market
  BTTS_1H: {
    OVER_05_1H: 0.55,
    OVER_15_1H: 0.70,
    BTTS_1H: 1.0,
    OVER_95_CORNERS: 0.40,
    OVER_45_CORNERS_1H: 0.45,
    CORNERS_HANDICAP: 0.15,
    OVER_35_CARDS: 0.30,
    OVER_45_CARDS: 0.30,
  },
  // Corners markets
  OVER_95_CORNERS: {
    OVER_05_1H: 0.35,
    OVER_15_1H: 0.45,
    BTTS_1H: 0.40,
    OVER_95_CORNERS: 1.0,
    OVER_45_CORNERS_1H: 0.75,
    CORNERS_HANDICAP: 0.55,
    OVER_35_CARDS: 0.45,
    OVER_45_CARDS: 0.45,
  },
  OVER_45_CORNERS_1H: {
    OVER_05_1H: 0.4,
    OVER_15_1H: 0.5,
    BTTS_1H: 0.45,
    OVER_95_CORNERS: 0.75,
    OVER_45_CORNERS_1H: 1.0,
    CORNERS_HANDICAP: 0.5,
    OVER_35_CARDS: 0.40,
    OVER_45_CARDS: 0.40,
  },
  CORNERS_HANDICAP: {
    OVER_05_1H: 0.15,
    OVER_15_1H: 0.2,
    BTTS_1H: 0.15,
    OVER_95_CORNERS: 0.55,
    OVER_45_CORNERS_1H: 0.5,
    CORNERS_HANDICAP: 1.0,
    OVER_35_CARDS: 0.35,
    OVER_45_CARDS: 0.35,
  },
  // Cards markets
  OVER_35_CARDS: {
    OVER_05_1H: 0.25,
    OVER_15_1H: 0.30,
    BTTS_1H: 0.30,
    OVER_95_CORNERS: 0.45,
    OVER_45_CORNERS_1H: 0.40,
    CORNERS_HANDICAP: 0.35,
    OVER_35_CARDS: 1.0,
    OVER_45_CARDS: 0.80,
  },
  OVER_45_CARDS: {
    OVER_05_1H: 0.25,
    OVER_15_1H: 0.30,
    BTTS_1H: 0.30,
    OVER_95_CORNERS: 0.45,
    OVER_45_CORNERS_1H: 0.40,
    CORNERS_HANDICAP: 0.35,
    OVER_35_CARDS: 0.80,
    OVER_45_CARDS: 1.0,
  },
}

/**
 * League style adjustments
 */
const LEAGUE_CORRELATION_ADJ: Record<number, number> = {
  88: 0.05, // Eredivisie - attacking, open games
  78: 0.05, // Bundesliga - attacking football
  39: 0.02, // Premier League - balanced
  140: 0.0, // La Liga - tactical
  135: -0.05, // Serie A - defensive traditions
  61: -0.05, // Ligue 1 - defensive
  94: 0.02, // Primeira Liga
  262: 0.02, // Liga MX
  253: 0.0, // MLS
}

/**
 * Derby pairs for intensity calculation
 */
const DERBY_PAIRS = new Set([
  '194-197', '197-194', // Ajax - Feyenoord
  '194-195', '195-194', // Ajax - PSV
  '157-165', '165-157', // Bayern - Dortmund
  '33-34', '34-33', // Man Utd - Man City
  '40-42', '42-40', // Liverpool - Everton
  '47-48', '48-47', // Arsenal - Tottenham
  '529-530', '530-529', // Barcelona - Real Madrid
  '489-505', '505-489', // Inter - Milan
  '79-80', '80-79', // PSG - Marseille
])

@Injectable()
export class CorrelationService {
  private readonly logger = new Logger(CorrelationService.name)

  /**
   * Get base correlation from matrix
   */
  getBaseCorrelation(marketA: MarketType | string, marketB: MarketType | string): number {
    const keyA = this.normalizeMarketKey(marketA)
    const keyB = this.normalizeMarketKey(marketB)

    const correlation = CORRELATION_MATRIX[keyA]?.[keyB]

    if (correlation !== undefined) {
      return correlation
    }

    // Default correlations for unknown market combinations
    const isGoalsA = this.isGoalsMarket(keyA)
    const isGoalsB = this.isGoalsMarket(keyB)
    const isCornersA = this.isCornersMarket(keyA)
    const isCornersB = this.isCornersMarket(keyB)

    // Goals + Corners = moderate correlation
    if ((isGoalsA && isCornersB) || (isCornersA && isGoalsB)) {
      return 0.35
    }

    // Same market type = higher correlation
    if ((isGoalsA && isGoalsB) || (isCornersA && isCornersB)) {
      return 0.6
    }

    // Unknown = assume low correlation
    return 0.2
  }

  /**
   * Calculate dynamic correlation with all adjustments
   * Implements calculate_dynamic_correlation from COMBINADAS doc section 1.6
   */
  calculateDynamicCorrelation(
    fixture: BettingFixture,
    marketA: MarketType | string,
    marketB: MarketType | string,
    teamAStats: BettingTeamStats,
    teamBStats: BettingTeamStats,
    probFavorite?: number
  ): CorrelationResult {
    const adjustments: CorrelationAdjustment[] = []

    // Step 1: Base correlation from matrix
    const baseCorrelation = this.getBaseCorrelation(marketA, marketB)

    let dynamicCorrelation = baseCorrelation

    // ================================================
    // Adjustment 1: Possession difference (game style)
    // ================================================
    const possessionDiff = Math.abs(
      teamAStats.avg_possession - teamBStats.avg_possession
    )

    if (possessionDiff < 8) {
      // Similar possession = open game, both attacking
      dynamicCorrelation += 0.1
      adjustments.push({
        factor: 'POSSESSION_SIMILAR',
        value: 0.1,
        reason: `Possession diff ${possessionDiff.toFixed(1)}% < 8% = open game`,
      })
    } else if (possessionDiff > 15) {
      // One team dominates = less correlation
      dynamicCorrelation -= 0.08
      adjustments.push({
        factor: 'POSSESSION_DOMINANT',
        value: -0.08,
        reason: `Possession diff ${possessionDiff.toFixed(1)}% > 15% = one-sided`,
      })
    }

    // ================================================
    // Adjustment 2: Match intensity (derby, stakes)
    // ================================================
    const intensity = this.calculateMatchIntensity(
      teamAStats.teamId,
      teamBStats.teamId
    )

    if (intensity > 0) {
      dynamicCorrelation += intensity
      adjustments.push({
        factor: 'INTENSITY',
        value: intensity,
        reason: this.isDerby(teamAStats.teamId, teamBStats.teamId)
          ? 'Derby match'
          : 'High stakes match',
      })
    }

    // ================================================
    // Adjustment 3: High pressing (combined shots)
    // ================================================
    const combinedShots = teamAStats.avg_shots + teamBStats.avg_shots

    if (combinedShots > 28) {
      dynamicCorrelation += 0.12
      adjustments.push({
        factor: 'HIGH_PRESSING',
        value: 0.12,
        reason: `Combined shots ${combinedShots.toFixed(1)} > 28 = high pressing`,
      })
    } else if (combinedShots > 24) {
      dynamicCorrelation += 0.06
      adjustments.push({
        factor: 'MODERATE_PRESSING',
        value: 0.06,
        reason: `Combined shots ${combinedShots.toFixed(1)} > 24`,
      })
    } else if (combinedShots < 18) {
      dynamicCorrelation -= 0.08
      adjustments.push({
        factor: 'LOW_PRESSING',
        value: -0.08,
        reason: `Combined shots ${combinedShots.toFixed(1)} < 18 = low activity`,
      })
    }

    // ================================================
    // Adjustment 4: League style
    // ================================================
    const leagueAdj = LEAGUE_CORRELATION_ADJ[fixture.leagueId] || 0

    if (leagueAdj !== 0) {
      dynamicCorrelation += leagueAdj
      adjustments.push({
        factor: 'LEAGUE_STYLE',
        value: leagueAdj,
        reason:
          leagueAdj > 0
            ? 'Attacking league (Eredivisie/Bundesliga)'
            : 'Defensive league (Serie A/Ligue 1)',
      })
    }

    // ================================================
    // Adjustment 5: Extreme favorite
    // ================================================
    if (probFavorite !== undefined) {
      if (probFavorite > 0.75) {
        dynamicCorrelation -= 0.1
        adjustments.push({
          factor: 'EXTREME_FAVORITE',
          value: -0.1,
          reason: `Favorite at ${(probFavorite * 100).toFixed(0)}% = less correlation`,
        })
      } else if (probFavorite > 0.65) {
        dynamicCorrelation -= 0.05
        adjustments.push({
          factor: 'STRONG_FAVORITE',
          value: -0.05,
          reason: `Favorite at ${(probFavorite * 100).toFixed(0)}%`,
        })
      }
    }

    // ================================================
    // Clamp final correlation
    // ================================================
    const finalCorrelation = Math.max(-0.3, Math.min(0.8, dynamicCorrelation))

    this.logger.debug(
      `Correlation ${marketA}-${marketB}: base=${baseCorrelation.toFixed(2)}, ` +
        `dynamic=${dynamicCorrelation.toFixed(2)}, final=${finalCorrelation.toFixed(2)}`
    )

    return {
      baseCorrelation,
      dynamicCorrelation,
      adjustments,
      finalCorrelation,
    }
  }

  /**
   * Calculate joint probability with correlation
   * Implements joint_probability from COMBINADAS doc section 2.2
   *
   * P(A ∩ B) = P(A) × P(B) + ρ × σ(A) × σ(B)
   * where σ(X) = √(P(X) × (1 - P(X)))
   */
  jointProbability(probA: number, probB: number, correlation: number): number {
    // Independent probability
    const pIndependent = probA * probB

    // Correlation adjustment using Gaussian copula approximation
    const sigmaA = Math.sqrt(probA * (1 - probA))
    const sigmaB = Math.sqrt(probB * (1 - probB))
    const correlationAdjustment = correlation * sigmaA * sigmaB

    // Joint probability
    let pJoint = pIndependent + correlationAdjustment

    // Clamp: can't be greater than minimum of the two, or negative
    pJoint = Math.max(0.01, Math.min(pJoint, Math.min(probA, probB)))

    return pJoint
  }

  /**
   * Calculate joint probability for triple (3 events)
   * Implements joint_probability_triple from COMBINADAS doc section 2.2
   *
   * For triples: 2 from same match (correlated) + 1 independent
   */
  jointProbabilityTriple(
    probA: number,
    probB: number,
    probC: number,
    corrAB: number,
    corrAC: number = 0,
    corrBC: number = 0
  ): number {
    // First: joint probability of A and B (correlated, same match)
    const pAB = this.jointProbability(probA, probB, corrAB)

    // Second: C is independent (different match)
    // Use minimal cross-match correlation
    const crossCorr = Math.max(corrAC, corrBC) * 0.1 // Only 10% of within-match correlation

    const pABC = this.jointProbability(pAB, probC, crossCorr)

    return pABC
  }

  /**
   * Calculate match intensity
   */
  calculateMatchIntensity(teamAId: number, teamBId: number): number {
    let intensity = 0

    // Derby bonus
    if (this.isDerby(teamAId, teamBId)) {
      intensity += 0.08
    }

    return intensity
  }

  /**
   * Check if teams form a derby
   */
  isDerby(teamAId: number, teamBId: number): boolean {
    return DERBY_PAIRS.has(`${teamAId}-${teamBId}`)
  }

  /**
   * Calculate EV adjustment from correlation
   * Shows how much "hidden edge" the correlation provides
   */
  calculateHiddenEdge(
    probA: number,
    probB: number,
    oddsA: number,
    oddsB: number,
    correlation: number
  ): {
    evIndependent: number
    evCorrelated: number
    hiddenEdge: number
  } {
    const combinedOdds = oddsA * oddsB

    // EV if independent (what the bookmaker calculates)
    const pIndependent = probA * probB
    const evIndependent = pIndependent * combinedOdds - 1

    // EV with correlation (what we calculate)
    const pCorrelated = this.jointProbability(probA, probB, correlation)
    const evCorrelated = pCorrelated * combinedOdds - 1

    // Hidden edge = difference
    const hiddenEdge = evCorrelated - evIndependent

    return {
      evIndependent,
      evCorrelated,
      hiddenEdge,
    }
  }

  /**
   * Normalize market key for matrix lookup
   */
  private normalizeMarketKey(market: MarketType | string): string {
    const m = String(market).toUpperCase()

    // BTTS 1H
    if (m.includes('BTTS') && m.includes('1H')) {
      return 'BTTS_1H'
    }

    // Goals markets
    if (m.includes('OVER') && m.includes('05') && m.includes('1H') && !m.includes('CORNER') && !m.includes('CARD')) {
      return 'OVER_05_1H'
    }
    if (m.includes('OVER') && m.includes('15') && m.includes('1H') && !m.includes('CORNER') && !m.includes('CARD')) {
      return 'OVER_15_1H'
    }

    // Corners markets
    if (m.includes('CORNER') && (m.includes('95') || m.includes('9.5'))) {
      return 'OVER_95_CORNERS'
    }
    if (
      m.includes('CORNER') &&
      (m.includes('45') || m.includes('4.5')) &&
      m.includes('1H')
    ) {
      return 'OVER_45_CORNERS_1H'
    }
    if (m.includes('CORNER') && m.includes('HANDICAP')) {
      return 'CORNERS_HANDICAP'
    }

    // Cards markets
    if (m.includes('CARD') && (m.includes('35') || m.includes('3.5'))) {
      return 'OVER_35_CARDS'
    }
    if (m.includes('CARD') && (m.includes('45') || m.includes('4.5'))) {
      return 'OVER_45_CARDS'
    }
    if (m.includes('CARD') && (m.includes('55') || m.includes('5.5'))) {
      return 'OVER_45_CARDS' // Map to 4.5 for correlation purposes
    }
    if (m.includes('CARD') && (m.includes('25') || m.includes('2.5'))) {
      return 'OVER_35_CARDS' // Map to 3.5 for correlation purposes
    }

    // Return as-is if already normalized
    if (CORRELATION_MATRIX[m]) {
      return m
    }

    // Defaults by market type
    if (this.isBTTSMarket(m)) {
      return 'BTTS_1H'
    }
    if (this.isGoalsMarket(m)) {
      return 'OVER_05_1H'
    }
    if (this.isCornersMarket(m)) {
      return 'OVER_95_CORNERS'
    }
    if (this.isCardsMarket(m)) {
      return 'OVER_35_CARDS'
    }

    return m
  }

  private isGoalsMarket(market: string): boolean {
    const m = market.toUpperCase()
    return (
      (m.includes('GOAL') || (m.includes('OVER') && m.includes('1H'))) &&
      !m.includes('CORNER') &&
      !m.includes('CARD') &&
      !m.includes('BTTS')
    )
  }

  private isCornersMarket(market: string): boolean {
    const m = market.toUpperCase()
    return m.includes('CORNER')
  }

  private isCardsMarket(market: string): boolean {
    const m = market.toUpperCase()
    return m.includes('CARD') || m.includes('TARJETA')
  }

  private isBTTSMarket(market: string): boolean {
    const m = market.toUpperCase()
    return m.includes('BTTS')
  }
}
