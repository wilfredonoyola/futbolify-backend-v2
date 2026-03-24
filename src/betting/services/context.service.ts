import { Injectable, Logger } from '@nestjs/common'
import { BettingTeamStats, BettingFixture } from './api-football-betting.service'
import { WeatherData } from './open-meteo.service'

/**
 * Match context result with multipliers and flags
 */
export interface MatchContext {
  fixtureId: number
  // Multipliers for probability adjustment
  goalsMultiplier: number
  cornersMultiplier: number
  // Correlation adjustment
  correlationAdj: number
  // Intensity score for dynamic correlation
  intensityScore: number
  // Flags explaining what factors are applied
  flags: string[]
  // Warnings for anti-patterns
  warnings: string[]
}

/**
 * Known derby pairs (team IDs from API-Football)
 */
const DERBY_PAIRS: Array<[number, number, string]> = [
  // Netherlands
  [194, 197, 'De Klassieker'], // Ajax vs Feyenoord
  [194, 195, 'De Topper'], // Ajax vs PSV
  // Germany
  [157, 165, 'Der Klassiker'], // Bayern vs Dortmund
  [173, 174, 'Nordderby'], // Hamburg vs Bremen
  // England
  [33, 34, 'Manchester Derby'], // Man Utd vs Man City
  [40, 42, 'Merseyside Derby'], // Liverpool vs Everton
  [47, 48, 'North London Derby'], // Arsenal vs Tottenham
  // Spain
  [529, 530, 'El Clásico'], // Barcelona vs Real Madrid
  [530, 531, 'Derby Madrileño'], // Real Madrid vs Atlético
  // Italy
  [489, 505, 'Derby della Madonnina'], // Inter vs Milan
  [497, 498, 'Derby di Roma'], // Roma vs Lazio
  [492, 505, 'Derby d\'Italia'], // Juventus vs Inter
  // France
  [79, 80, 'Le Classique'], // PSG vs Marseille
  [79, 81, 'Derby de France'], // PSG vs Lyon
  // Portugal
  [212, 211, 'O Clássico'], // Benfica vs Porto
  [212, 215, 'Derby de Lisboa'], // Benfica vs Sporting
]

/**
 * League team counts for position-based calculations
 */
const LEAGUE_TEAM_COUNTS: Record<number, number> = {
  88: 18, // Eredivisie
  78: 18, // Bundesliga
  39: 20, // Premier League
  140: 20, // La Liga
  135: 20, // Serie A
  61: 18, // Ligue 1
  94: 18, // Primeira Liga
  262: 18, // Liga MX
  253: 29, // MLS (varies)
}

/**
 * League correlation adjustments
 */
const LEAGUE_CORRELATION_ADJ: Record<number, number> = {
  88: 0.05, // Eredivisie - attacking football
  78: 0.05, // Bundesliga - attacking football
  39: 0.02, // Premier League - balanced
  140: 0.0, // La Liga - tactical
  135: -0.05, // Serie A - defensive
  61: -0.05, // Ligue 1 - defensive
  94: 0.02, // Primeira Liga
  262: 0.02, // Liga MX
}

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name)

  /**
   * Get match context with all multipliers and adjustments
   * Implements get_match_context from COMBINADAS doc section 9.1
   */
  getMatchContext(
    fixture: BettingFixture,
    teamAStats: BettingTeamStats,
    teamBStats: BettingTeamStats,
    weather: WeatherData | null,
    options?: {
      teamAPosition?: number
      teamBPosition?: number
      matchday?: number
      isPostBreak?: boolean
      teamAHasEuropeanFixture?: boolean
      teamBHasEuropeanFixture?: boolean
      teamAOnScoringStreak?: boolean
      teamBOnScoringStreak?: boolean
      teamAIsChampion?: boolean
      teamBIsChampion?: boolean
      teamAIsRelegated?: boolean
      teamBIsRelegated?: boolean
    }
  ): MatchContext {
    const flags: string[] = []
    const warnings: string[] = []

    let goalsMultiplier = 1.0
    let cornersMultiplier = 1.0
    let correlationAdj = 0.0
    let intensityScore = 0.0

    // ================================================
    // DERBY DETECTION
    // ================================================
    if (this.isDerby(teamAStats.teamId, teamBStats.teamId)) {
      goalsMultiplier *= 1.05
      cornersMultiplier *= 1.08
      correlationAdj += 0.08
      intensityScore += 0.08
      flags.push('DERBY')
    }

    // ================================================
    // DECISIVE MATCHDAY
    // ================================================
    if (options?.matchday && options.teamAPosition && options.teamBPosition) {
      const totalTeams = LEAGUE_TEAM_COUNTS[fixture.leagueId] || 20
      const totalMatchdays = (totalTeams - 1) * 2

      // Final 5 matchdays
      if (options.matchday >= totalMatchdays - 5) {
        goalsMultiplier *= 1.08
        cornersMultiplier *= 1.1
        correlationAdj += 0.06
        intensityScore += 0.04
        flags.push('DECISIVE_MATCHDAY')
      }

      // Both teams in top 5 (title race)
      if (options.teamAPosition <= 5 && options.teamBPosition <= 5) {
        intensityScore += 0.06
        flags.push('TOP_5_CLASH')
      }

      // Both teams in relegation zone
      const relegationZone = totalTeams - 3
      if (
        options.teamAPosition >= relegationZone &&
        options.teamBPosition >= relegationZone
      ) {
        intensityScore += 0.08
        flags.push('RELEGATION_BATTLE')
      }

      // Mid-table clash (positions 8-14)
      if (
        options.teamAPosition >= 8 &&
        options.teamAPosition <= 14 &&
        options.teamBPosition >= 8 &&
        options.teamBPosition <= 14
      ) {
        intensityScore -= 0.04
        flags.push('MID_TABLE')
      }
    }

    // ================================================
    // MIDWEEK FATIGUE
    // ================================================
    const matchDate = new Date(fixture.kickoff)
    const dayOfWeek = matchDate.getDay()
    // Tuesday = 2, Wednesday = 3, Thursday = 4
    if (dayOfWeek >= 2 && dayOfWeek <= 4) {
      goalsMultiplier *= 0.95
      cornersMultiplier *= 0.97
      flags.push('MIDWEEK_FATIGUE')
    }

    // ================================================
    // SCORING STREAK
    // ================================================
    if (options?.teamAOnScoringStreak || options?.teamBOnScoringStreak) {
      goalsMultiplier *= 1.06
      flags.push('SCORING_STREAK')
    }

    // ================================================
    // POST INTERNATIONAL BREAK
    // ================================================
    if (options?.isPostBreak) {
      goalsMultiplier *= 0.92
      cornersMultiplier *= 0.95
      correlationAdj -= 0.05
      flags.push('POST_BREAK')
    }

    // ================================================
    // WEATHER CONDITIONS
    // ================================================
    if (weather) {
      if (weather.isWindy || weather.windSpeed > 40) {
        goalsMultiplier *= 0.93
        cornersMultiplier *= 1.05
        correlationAdj -= 0.1 // Wind BREAKS correlation between goals and corners
        flags.push('STRONG_WIND')
      }

      if (weather.isRainy || weather.precipitation > 2) {
        goalsMultiplier *= 0.95
        cornersMultiplier *= 1.03
        flags.push('RAIN')
      }

      if (weather.precipitation > 5) {
        flags.push('HEAVY_RAIN')
      }

      if (weather.isExtreme) {
        goalsMultiplier *= 0.88
        cornersMultiplier *= 0.95
        flags.push('EXTREME_WEATHER')
      }
    }

    // ================================================
    // ROTATION (European fixtures)
    // ================================================
    if (options?.teamAHasEuropeanFixture) {
      goalsMultiplier *= 0.9
      cornersMultiplier *= 0.93
      flags.push(`ROTATION_${teamAStats.teamName.substring(0, 10)}`)
    }

    if (options?.teamBHasEuropeanFixture) {
      goalsMultiplier *= 0.9
      cornersMultiplier *= 0.93
      flags.push(`ROTATION_${teamBStats.teamName.substring(0, 10)}`)
    }

    // ================================================
    // CHAMPION EFFECT (no motivation)
    // ================================================
    if (options?.teamAIsChampion || options?.teamBIsChampion) {
      goalsMultiplier *= 0.85
      cornersMultiplier *= 0.9
      flags.push('CHAMPION_NO_MOTIVATION')
      warnings.push('Champion team may lack motivation')
    }

    // ================================================
    // RELEGATED EFFECT (unpredictable)
    // ================================================
    if (options?.teamAIsRelegated || options?.teamBIsRelegated) {
      // Increase variance warning
      flags.push('RELEGATED_TEAM')
      warnings.push('Relegated team - high variance, avoid combos')
    }

    // ================================================
    // LEAGUE STYLE ADJUSTMENT
    // ================================================
    const leagueAdj = LEAGUE_CORRELATION_ADJ[fixture.leagueId] || 0
    correlationAdj += leagueAdj

    this.logger.debug(
      `Context for ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ` +
        `goals=${goalsMultiplier.toFixed(2)}, corners=${cornersMultiplier.toFixed(2)}, ` +
        `corr=${correlationAdj.toFixed(2)}, flags=[${flags.join(',')}]`
    )

    return {
      fixtureId: fixture.fixtureId,
      goalsMultiplier: Math.round(goalsMultiplier * 100) / 100,
      cornersMultiplier: Math.round(cornersMultiplier * 100) / 100,
      correlationAdj: Math.round(correlationAdj * 100) / 100,
      intensityScore: Math.round(intensityScore * 100) / 100,
      flags,
      warnings,
    }
  }

  /**
   * Calculate dynamic correlation between two markets
   * Implements calculate_dynamic_correlation from COMBINADAS doc section 1.6
   */
  calculateDynamicCorrelation(
    baseCorrelation: number,
    teamAStats: BettingTeamStats,
    teamBStats: BettingTeamStats,
    context: MatchContext,
    probFavorite?: number
  ): number {
    let correlation = baseCorrelation

    // Adjustment 1: Possession difference (open vs closed game)
    const possessionDiff = Math.abs(
      teamAStats.avg_possession - teamBStats.avg_possession
    )
    if (possessionDiff < 8) {
      // Similar possession = open game
      correlation += 0.1
    } else if (possessionDiff > 15) {
      // One team dominates
      correlation -= 0.08
    }

    // Adjustment 2: Intensity (from context)
    correlation += context.intensityScore

    // Adjustment 3: High pressing (combined shots)
    const combinedShots = teamAStats.avg_shots + teamBStats.avg_shots
    if (combinedShots > 28) {
      correlation += 0.12
    } else if (combinedShots > 24) {
      correlation += 0.06
    } else if (combinedShots < 18) {
      correlation -= 0.08
    }

    // Adjustment 4: League style (already in context.correlationAdj)
    correlation += context.correlationAdj

    // Adjustment 5: Extreme favorite
    if (probFavorite) {
      if (probFavorite > 0.75) {
        correlation -= 0.1
      } else if (probFavorite > 0.65) {
        correlation -= 0.05
      }
    }

    // Clamp between -0.30 and +0.80
    return Math.max(-0.3, Math.min(0.8, correlation))
  }

  /**
   * Calculate match intensity for correlation adjustment
   */
  calculateMatchIntensity(
    fixture: BettingFixture,
    teamAPosition?: number,
    teamBPosition?: number,
    matchday?: number
  ): number {
    let intensity = 0.0

    // Derby
    if (this.isDerby(fixture.homeTeamId, fixture.awayTeamId)) {
      intensity += 0.08
    }

    if (teamAPosition && teamBPosition) {
      // Both in top 5
      if (teamAPosition <= 5 && teamBPosition <= 5) {
        intensity += 0.06
      }

      // Relegation battle
      const totalTeams = LEAGUE_TEAM_COUNTS[fixture.leagueId] || 20
      const relegationZone = totalTeams - 3
      if (teamAPosition >= relegationZone && teamBPosition >= relegationZone) {
        intensity += 0.08
      }

      // End of season
      if (matchday) {
        const totalMatchdays = (totalTeams - 1) * 2
        if (matchday >= totalMatchdays - 5) {
          intensity += 0.04
        }
      }

      // Mid-table (no stakes)
      if (
        teamAPosition >= 8 &&
        teamAPosition <= 14 &&
        teamBPosition >= 8 &&
        teamBPosition <= 14
      ) {
        intensity -= 0.04
      }
    }

    return intensity
  }

  /**
   * Get league correlation adjustment
   */
  getLeagueCorrelationAdjustment(leagueId: number): number {
    return LEAGUE_CORRELATION_ADJ[leagueId] || 0
  }

  /**
   * Check if two teams form a derby
   */
  isDerby(teamAId: number, teamBId: number): boolean {
    return DERBY_PAIRS.some(
      ([a, b]) =>
        (a === teamAId && b === teamBId) || (b === teamAId && a === teamBId)
    )
  }

  /**
   * Get derby name if exists
   */
  getDerbyName(teamAId: number, teamBId: number): string | null {
    const derby = DERBY_PAIRS.find(
      ([a, b]) =>
        (a === teamAId && b === teamBId) || (b === teamAId && a === teamBId)
    )
    return derby ? derby[2] : null
  }

  /**
   * Get base correlation matrix value
   */
  getBaseCorrelation(
    marketA: string,
    marketB: string
  ): number {
    // Base correlation matrix from COMBINADAS doc section 1.2
    const correlationMatrix: Record<string, Record<string, number>> = {
      over_05_1h: {
        over_05_1h: 1.0,
        over_15_1h: 0.65,
        over_95_corners: 0.35,
        over_45_corners_1h: 0.4,
        corners_hc: 0.15,
      },
      over_15_1h: {
        over_05_1h: 0.65,
        over_15_1h: 1.0,
        over_95_corners: 0.45,
        over_45_corners_1h: 0.5,
        corners_hc: 0.2,
      },
      over_95_corners: {
        over_05_1h: 0.35,
        over_15_1h: 0.45,
        over_95_corners: 1.0,
        over_45_corners_1h: 0.75,
        corners_hc: 0.55,
      },
      over_45_corners_1h: {
        over_05_1h: 0.4,
        over_15_1h: 0.5,
        over_95_corners: 0.75,
        over_45_corners_1h: 1.0,
        corners_hc: 0.5,
      },
      corners_hc: {
        over_05_1h: 0.15,
        over_15_1h: 0.2,
        over_95_corners: 0.55,
        over_45_corners_1h: 0.5,
        corners_hc: 1.0,
      },
    }

    // Normalize market names
    const normalizeMarket = (m: string): string => {
      if (m.includes('goal') && m.includes('0.5') && m.includes('1h'))
        return 'over_05_1h'
      if (m.includes('goal') && m.includes('1.5') && m.includes('1h'))
        return 'over_15_1h'
      if (m.includes('corner') && m.includes('9.5')) return 'over_95_corners'
      if (m.includes('corner') && m.includes('4.5') && m.includes('1h'))
        return 'over_45_corners_1h'
      if (m.includes('corner') && m.includes('hc')) return 'corners_hc'
      return m.toLowerCase().replace(/[^a-z0-9]/g, '_')
    }

    const keyA = normalizeMarket(marketA)
    const keyB = normalizeMarket(marketB)

    return correlationMatrix[keyA]?.[keyB] ?? 0.3 // Default correlation
  }

  /**
   * Apply context multipliers to a probability
   */
  applyContextToProb(
    prob: number,
    market: string,
    context: MatchContext
  ): number {
    const isGoalsMarket =
      market.toLowerCase().includes('goal') || market.includes('1h')
    const isCornersMarket = market.toLowerCase().includes('corner')

    let multiplier = 1.0
    if (isGoalsMarket) {
      multiplier = context.goalsMultiplier
    } else if (isCornersMarket) {
      multiplier = context.cornersMultiplier
    }

    // Apply multiplier but keep probability in valid range
    const adjusted = prob * multiplier
    return Math.max(0.01, Math.min(0.99, adjusted))
  }
}
