import { Injectable, Logger } from '@nestjs/common'
import { GeneratedCombo, ComboLeg } from './combo-engine.service'
import { ComboType } from '../enums/betting.enums'

/**
 * Anti-pattern types from COMBINADAS doc section 10
 */
export enum AntiPatternType {
  FALSA_CORRELACION = 'FALSA_CORRELACION',
  TRAMPA_DE_PROMEDIO = 'TRAMPA_DE_PROMEDIO',
  MUESTRA_CONTAMINADA = 'MUESTRA_CONTAMINADA',
  EFECTO_CAMPEON = 'EFECTO_CAMPEON',
  EFECTO_DESCENDIDO = 'EFECTO_DESCENDIDO',
  COMBO_INFLADA = 'COMBO_INFLADA',
  CONCENTRACION_EXCESIVA = 'CONCENTRACION_EXCESIVA',
}

/**
 * Anti-pattern detection result
 */
export interface AntiPatternWarning {
  pattern: AntiPatternType
  description: string
  action: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  scoreAdjustment: number
}

/**
 * Team context for anti-pattern detection
 */
export interface TeamContext {
  teamId: number
  isChampion: boolean
  isRelegated: boolean
  coachChangedRecently: boolean
  gamesAfterCoachChange: number
  cornersStdDev: number
  cornersAvg: number
  probFavorite?: number
  remainingGames: number
}

/**
 * Daily picks summary for concentration check
 */
export interface DailyPicksSummary {
  picksByFixture: Map<number, number>
  picksByLeague: Map<number, number>
  totalPicks: number
}

@Injectable()
export class AntiPatternService {
  private readonly logger = new Logger(AntiPatternService.name)

  /**
   * Check all anti-patterns for a combo
   * Implements check_anti_patterns from COMBINADAS doc section 10
   */
  checkAntiPatterns(
    combo: GeneratedCombo,
    teamContexts: Map<number, TeamContext>,
    dailySummary: DailyPicksSummary
  ): AntiPatternWarning[] {
    const warnings: AntiPatternWarning[] = []

    // Check each anti-pattern
    const falsaCorrelacion = this.checkFalsaCorrelacion(combo, teamContexts)
    if (falsaCorrelacion) warnings.push(falsaCorrelacion)

    const trampaPromedio = this.checkTrampaDePromedio(combo, teamContexts)
    if (trampaPromedio) warnings.push(trampaPromedio)

    const muestraContaminada = this.checkMuestraContaminada(combo, teamContexts)
    if (muestraContaminada) warnings.push(muestraContaminada)

    const efectoCampeon = this.checkEfectoCampeon(combo, teamContexts)
    if (efectoCampeon) warnings.push(efectoCampeon)

    const efectoDescendido = this.checkEfectoDescendido(combo, teamContexts)
    if (efectoDescendido) warnings.push(efectoDescendido)

    const comboInflada = this.checkComboInflada(combo)
    if (comboInflada) warnings.push(comboInflada)

    const concentracionExcesiva = this.checkConcentracionExcesiva(
      combo,
      dailySummary
    )
    if (concentracionExcesiva) warnings.push(concentracionExcesiva)

    if (warnings.length > 0) {
      this.logger.warn(
        `Combo has ${warnings.length} anti-pattern warnings: ${warnings.map((w) => w.pattern).join(', ')}`
      )
    }

    return warnings
  }

  /**
   * FALSA_CORRELACION: Combo where correlation seems high but causal mechanism doesn't exist
   * Example: Over 0.5 goals 1H + Under 8.5 corners with extreme favorite (85%+)
   */
  private checkFalsaCorrelacion(
    combo: GeneratedCombo,
    teamContexts: Map<number, TeamContext>
  ): AntiPatternWarning | null {
    // Only applies to GEMELA type combos
    if (combo.type !== ComboType.GEMELA) {
      return null
    }

    // Check if it's a same-match combo
    const fixtureIds = new Set(combo.legs.map((l) => l.fixtureId))
    if (fixtureIds.size !== 1) {
      return null // Not same match
    }

    // Check for extreme favorite
    const fixtureId = combo.legs[0].fixtureId
    const homeTeamContext = this.getTeamContextForFixture(
      fixtureId,
      teamContexts
    )

    if (homeTeamContext?.probFavorite && homeTeamContext.probFavorite > 0.85) {
      // Check if combo has goals + corners over
      const hasGoals = combo.legs.some(
        (l) =>
          String(l.market).toLowerCase().includes('goal') ||
          String(l.market).toLowerCase().includes('1h')
      )
      const hasCornersOver = combo.legs.some(
        (l) =>
          String(l.market).toLowerCase().includes('corner') &&
          String(l.market).toLowerCase().includes('over')
      )

      if (hasGoals && hasCornersOver) {
        return {
          pattern: AntiPatternType.FALSA_CORRELACION,
          description:
            'Extreme favorite (85%+) can score early penalty without generating corners',
          action: 'DISCARD combo, bet picks individually',
          severity: 'CRITICAL',
          scoreAdjustment: -25,
        }
      }
    }

    return null
  }

  /**
   * TRAMPA_DE_PROMEDIO: Team with high avg corners but bimodal distribution
   * Detection: corners_std_dev > corners_avg * 0.5
   */
  private checkTrampaDePromedio(
    combo: GeneratedCombo,
    teamContexts: Map<number, TeamContext>
  ): AntiPatternWarning | null {
    for (const leg of combo.legs) {
      // Only check corners markets
      if (!String(leg.market).toLowerCase().includes('corner')) {
        continue
      }

      const ctx = this.getTeamContextForLeg(leg, teamContexts)
      if (!ctx) continue

      // Check bimodal distribution
      if (ctx.cornersAvg > 0 && ctx.cornersStdDev > ctx.cornersAvg * 0.5) {
        return {
          pattern: AntiPatternType.TRAMPA_DE_PROMEDIO,
          description: `Team has bimodal corner distribution (stdDev ${ctx.cornersStdDev.toFixed(1)} > avg ${ctx.cornersAvg.toFixed(1)} * 0.5)`,
          action: 'Reduce confidence by 15 points',
          severity: 'MEDIUM',
          scoreAdjustment: -15,
        }
      }
    }

    return null
  }

  /**
   * MUESTRA_CONTAMINADA: Team that recently changed coach
   * Historical stats don't reflect current style
   */
  private checkMuestraContaminada(
    combo: GeneratedCombo,
    teamContexts: Map<number, TeamContext>
  ): AntiPatternWarning | null {
    for (const leg of combo.legs) {
      const ctx = this.getTeamContextForLeg(leg, teamContexts)
      if (!ctx) continue

      if (ctx.coachChangedRecently) {
        if (ctx.gamesAfterCoachChange < 5) {
          return {
            pattern: AntiPatternType.MUESTRA_CONTAMINADA,
            description: `Team changed coach recently, only ${ctx.gamesAfterCoachChange} games since change`,
            action: 'SKIP - not enough data post coach change',
            severity: 'HIGH',
            scoreAdjustment: -20,
          }
        }
      }
    }

    return null
  }

  /**
   * EFECTO_CAMPEON: Already champion team with no motivation
   */
  private checkEfectoCampeon(
    combo: GeneratedCombo,
    teamContexts: Map<number, TeamContext>
  ): AntiPatternWarning | null {
    for (const leg of combo.legs) {
      const ctx = this.getTeamContextForLeg(leg, teamContexts)
      if (!ctx) continue

      if (ctx.isChampion && ctx.remainingGames <= 3) {
        return {
          pattern: AntiPatternType.EFECTO_CAMPEON,
          description: `Team is already champion with ${ctx.remainingGames} games remaining`,
          action: 'Reduce goals_multiplier × 0.85, corners_multiplier × 0.90',
          severity: 'MEDIUM',
          scoreAdjustment: -10,
        }
      }
    }

    return null
  }

  /**
   * EFECTO_DESCENDIDO: Already relegated team, unpredictable behavior
   */
  private checkEfectoDescendido(
    combo: GeneratedCombo,
    teamContexts: Map<number, TeamContext>
  ): AntiPatternWarning | null {
    for (const leg of combo.legs) {
      const ctx = this.getTeamContextForLeg(leg, teamContexts)
      if (!ctx) continue

      if (ctx.isRelegated && ctx.remainingGames <= 3) {
        return {
          pattern: AntiPatternType.EFECTO_DESCENDIDO,
          description: `Team is already relegated with ${ctx.remainingGames} games remaining`,
          action:
            'Increase variance. DO NOT bet in combos, only individual picks with high edge',
          severity: 'HIGH',
          scoreAdjustment: -20,
        }
      }
    }

    return null
  }

  /**
   * COMBO_INFLADA: Combo with attractive odds but edge < 3% in each leg
   * Correlation cannot save picks without individual edge
   */
  private checkComboInflada(combo: GeneratedCombo): AntiPatternWarning | null {
    const lowEdgeLegs = combo.legs.filter((leg) => {
      // Assume legs have edge calculated
      const edge = leg.edge ?? 0
      return edge < 0.03
    })

    // All legs have low edge
    if (lowEdgeLegs.length === combo.legs.length) {
      return {
        pattern: AntiPatternType.COMBO_INFLADA,
        description: 'All legs have edge < 3% individually',
        action: 'DISCARD - correlation cannot save picks without individual edge',
        severity: 'CRITICAL',
        scoreAdjustment: -30,
      }
    }

    return null
  }

  /**
   * CONCENTRACION_EXCESIVA: 3+ picks from same fixture or same league in a day
   */
  private checkConcentracionExcesiva(
    combo: GeneratedCombo,
    dailySummary: DailyPicksSummary
  ): AntiPatternWarning | null {
    // Check fixture concentration
    for (const leg of combo.legs) {
      const fixtureCount =
        (dailySummary.picksByFixture.get(leg.fixtureId) || 0) + 1
      if (fixtureCount > 2) {
        return {
          pattern: AntiPatternType.CONCENTRACION_EXCESIVA,
          description: `${fixtureCount} picks from the same fixture`,
          action: 'Force diversification. Remove picks with lower EV',
          severity: 'MEDIUM',
          scoreAdjustment: -10,
        }
      }
    }

    // Check league concentration
    for (const leg of combo.legs) {
      const leagueCount =
        (dailySummary.picksByLeague.get(leg.leagueId) || 0) + 1
      if (leagueCount > 3) {
        return {
          pattern: AntiPatternType.CONCENTRACION_EXCESIVA,
          description: `${leagueCount} picks from the same league`,
          action: 'Force diversification. Remove picks with lower EV',
          severity: 'LOW',
          scoreAdjustment: -5,
        }
      }
    }

    return null
  }

  /**
   * Apply anti-pattern adjustments to combo score
   */
  applyAntiPatternAdjustments(
    combo: GeneratedCombo,
    warnings: AntiPatternWarning[]
  ): GeneratedCombo {
    let adjustedScore = combo.score

    for (const warning of warnings) {
      adjustedScore += warning.scoreAdjustment
      combo.warnings.push(`${warning.pattern}: ${warning.description}`)
    }

    return {
      ...combo,
      score: Math.max(0, Math.min(100, adjustedScore)),
    }
  }

  /**
   * Check if combo should be discarded based on critical warnings
   */
  shouldDiscardCombo(warnings: AntiPatternWarning[]): boolean {
    return warnings.some((w) => w.severity === 'CRITICAL')
  }

  /**
   * Get total score adjustment from warnings
   */
  getTotalScoreAdjustment(warnings: AntiPatternWarning[]): number {
    return warnings.reduce((sum, w) => sum + w.scoreAdjustment, 0)
  }

  /**
   * Helper: Get team context for a fixture
   */
  private getTeamContextForFixture(
    _fixtureId: number,
    contexts: Map<number, TeamContext>
  ): TeamContext | null {
    // Try to find any team context that matches
    for (const [, ctx] of contexts) {
      return ctx // Return first found for this fixture
    }
    return null
  }

  /**
   * Helper: Get team context for a leg
   */
  private getTeamContextForLeg(
    leg: ComboLeg,
    contexts: Map<number, TeamContext>
  ): TeamContext | null {
    return contexts.get(leg.fixtureId) || null
  }

  /**
   * Create empty daily summary
   */
  createEmptyDailySummary(): DailyPicksSummary {
    return {
      picksByFixture: new Map(),
      picksByLeague: new Map(),
      totalPicks: 0,
    }
  }

  /**
   * Update daily summary with a combo
   */
  updateDailySummary(
    summary: DailyPicksSummary,
    combo: GeneratedCombo
  ): DailyPicksSummary {
    for (const leg of combo.legs) {
      const fixtureCount = summary.picksByFixture.get(leg.fixtureId) || 0
      summary.picksByFixture.set(leg.fixtureId, fixtureCount + 1)

      const leagueCount = summary.picksByLeague.get(leg.leagueId) || 0
      summary.picksByLeague.set(leg.leagueId, leagueCount + 1)
    }

    summary.totalPicks += combo.legs.length
    return summary
  }
}
