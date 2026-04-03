import { Injectable, Logger } from '@nestjs/common'
import { GeneratedCombo } from './combo-engine.service'
import { ComboType } from '../enums/betting.enums'

/**
 * Portfolio optimization result
 */
export interface OptimizedPortfolio {
  selectedCombos: GeneratedCombo[]
  totalExposure: number
  expectedValue: number
  sharpeRatio: number
  diversificationScore: number
  rejectedCombos: Array<{
    combo: GeneratedCombo
    reason: string
  }>
}

/**
 * Portfolio constraints
 */
export interface PortfolioConstraints {
  maxCombosPerDay: number
  maxExposurePercent: number
  maxSameFixture: number
  maxSameLeague: number
  minComboScore: number
}

/**
 * Default constraints
 */
const DEFAULT_CONSTRAINTS: PortfolioConstraints = {
  maxCombosPerDay: 2,
  maxExposurePercent: 0.15, // 15% of bankroll
  maxSameFixture: 1, // No fixture repeat
  maxSameLeague: 2,
  minComboScore: 35, // Minimum score to consider
}

@Injectable()
export class PortfolioOptimizerService {
  private readonly logger = new Logger(PortfolioOptimizerService.name)

  /**
   * Optimize combo portfolio using adapted Sharpe Ratio
   * Implements optimize_combo_portfolio from COMBINADAS doc section 4
   */
  optimizePortfolio(
    combos: GeneratedCombo[],
    bankroll: number,
    constraints: Partial<PortfolioConstraints> = {}
  ): OptimizedPortfolio {
    const config = { ...DEFAULT_CONSTRAINTS, ...constraints }
    const selected: GeneratedCombo[] = []
    const rejected: Array<{ combo: GeneratedCombo; reason: string }> = []
    const usedFixtures = new Set<number>()
    const leagueCounts = new Map<number, number>()

    // Sort by adapted Sharpe Ratio (not just EV)
    const sortedCombos = this.sortBySharpeRatio(combos)

    // Priority order for combo types
    const typePriority: ComboType[] = [
      ComboType.SHARP_GEMELA,
      ComboType.GEMELA,
      ComboType.SHARP_CROSS_MERCADO,
      ComboType.TRIPLE_CORRELACIONADO,
      ComboType.CROSS_MERCADO,
      ComboType.CROSS_LIGA,
      ComboType.DOBLE_GEMELA,
      ComboType.GEMELA_INVERTIDA,
    ]

    // Process by priority
    for (const comboType of typePriority) {
      const typeCombos = sortedCombos.filter((c) => c.type === comboType)

      for (const combo of typeCombos) {
        // Check if we've reached max combos
        if (selected.length >= config.maxCombosPerDay) {
          rejected.push({ combo, reason: 'Max combos per day reached' })
          continue
        }

        // Check minimum score
        if (combo.score < config.minComboScore) {
          rejected.push({
            combo,
            reason: `Score ${combo.score} below minimum ${config.minComboScore}`,
          })
          continue
        }

        // Check fixture constraints
        const comboFixtures = new Set(combo.legs.map((l) => l.fixtureId))
        const fixtureOverlap = [...comboFixtures].filter((f) =>
          usedFixtures.has(f)
        )

        if (fixtureOverlap.length > 0) {
          rejected.push({
            combo,
            reason: `Fixture overlap: ${fixtureOverlap.join(', ')}`,
          })
          continue
        }

        // Check league constraints
        const comboLeagues = combo.legs.map((l) => l.leagueId)
        let leagueViolation = false

        for (const leagueId of comboLeagues) {
          const currentCount = leagueCounts.get(leagueId) || 0
          if (currentCount >= config.maxSameLeague) {
            leagueViolation = true
            break
          }
        }

        if (leagueViolation) {
          rejected.push({
            combo,
            reason: `Max combos per league (${config.maxSameLeague}) exceeded`,
          })
          continue
        }

        // Check for anti-patterns in warnings
        const criticalWarning = combo.warnings.find(
          (w) =>
            w.includes('FALSA_CORRELACIÓN') || w.includes('MUESTRA_CONTAMINADA')
        )

        if (criticalWarning) {
          rejected.push({ combo, reason: `Warning: ${criticalWarning}` })
          continue
        }

        // Accept combo
        selected.push(combo)

        // Update tracking
        for (const fixture of comboFixtures) {
          usedFixtures.add(fixture)
        }

        for (const leagueId of comboLeagues) {
          leagueCounts.set(leagueId, (leagueCounts.get(leagueId) || 0) + 1)
        }
      }
    }

    // Calculate portfolio metrics
    const totalExposure = this.calculateTotalExposure(selected, bankroll)
    const expectedValue = this.calculatePortfolioEV(selected)
    const sharpeRatio = this.calculatePortfolioSharpe(selected)
    const diversificationScore = this.calculateDiversification(selected)

    this.logger.log(
      `Portfolio optimized: ${selected.length} combos selected, ` +
        `EV=${(expectedValue * 100).toFixed(1)}%, Sharpe=${sharpeRatio.toFixed(2)}`
    )

    return {
      selectedCombos: selected,
      totalExposure,
      expectedValue,
      sharpeRatio,
      diversificationScore,
      rejectedCombos: rejected,
    }
  }

  /**
   * Sort combos by adapted Sharpe Ratio
   * Not just EV - considers risk-adjusted return
   */
  private sortBySharpeRatio(combos: GeneratedCombo[]): GeneratedCombo[] {
    return [...combos].sort((a, b) => {
      const sharpeA = this.calculateComboSharpe(a)
      const sharpeB = this.calculateComboSharpe(b)
      return sharpeB - sharpeA
    })
  }

  /**
   * Calculate Sharpe-like ratio for a single combo
   */
  private calculateComboSharpe(combo: GeneratedCombo): number {
    const ev = combo.evReal

    // Estimate variance based on probability
    // Higher probability = lower variance
    const variance = combo.pJoint * (1 - combo.pJoint)
    const stdDev = Math.sqrt(variance)

    // Avoid division by zero
    if (stdDev === 0) return ev * 100

    // Sharpe = (EV - risk_free) / stdDev
    // We use 0 as risk-free rate for betting
    const sharpe = ev / stdDev

    // Bonus for correlation edge (hidden value)
    const correlationBonus = combo.hiddenEdge > 0 ? combo.hiddenEdge * 0.5 : 0

    // Bonus for sharp confirmation
    const sharpBonus = combo.sharpConfirmed ? 0.2 : 0

    return sharpe + correlationBonus + sharpBonus
  }

  /**
   * Calculate portfolio Sharpe ratio
   */
  private calculatePortfolioSharpe(combos: GeneratedCombo[]): number {
    if (combos.length === 0) return 0

    const evSum = combos.reduce((sum, c) => sum + c.evReal, 0)
    const avgEV = evSum / combos.length

    // Portfolio variance (simplified - assumes some correlation between combos)
    const variances = combos.map((c) => c.pJoint * (1 - c.pJoint))
    const avgVariance = variances.reduce((sum, v) => sum + v, 0) / variances.length

    // Diversification reduces portfolio variance
    const diversificationFactor = Math.sqrt(combos.length)
    const portfolioStdDev = Math.sqrt(avgVariance) / diversificationFactor

    if (portfolioStdDev === 0) return avgEV * 100

    return avgEV / portfolioStdDev
  }

  /**
   * Calculate total exposure as percentage of bankroll
   */
  private calculateTotalExposure(
    combos: GeneratedCombo[],
    bankroll: number
  ): number {
    // Estimate stake based on combo type and score
    let totalStake = 0

    for (const combo of combos) {
      const stakePercent = this.estimateStakePercent(combo)
      totalStake += bankroll * stakePercent
    }

    return totalStake / bankroll
  }

  /**
   * Estimate stake percentage for a combo
   */
  private estimateStakePercent(combo: GeneratedCombo): number {
    // Base stake by combo type
    const baseStakes: Record<ComboType, number> = {
      [ComboType.GEMELA]: 0.015,
      [ComboType.GEMELA_INVERTIDA]: 0.01,
      [ComboType.CROSS_MERCADO]: 0.01,
      [ComboType.CROSS_LIGA]: 0.01,
      [ComboType.TRIPLE_CORRELACIONADO]: 0.0075,
      [ComboType.DOBLE_GEMELA]: 0.0075,
      [ComboType.SHARP_GEMELA]: 0.02,
      [ComboType.SHARP_CROSS_MERCADO]: 0.0125,
    }

    const base = baseStakes[combo.type] || 0.01

    // Adjust by score
    let multiplier = 1.0
    if (combo.score >= 80) multiplier = 1.0
    else if (combo.score >= 65) multiplier = 0.8
    else if (combo.score >= 50) multiplier = 0.6
    else multiplier = 0.4

    return base * multiplier
  }

  /**
   * Calculate portfolio expected value
   */
  private calculatePortfolioEV(combos: GeneratedCombo[]): number {
    if (combos.length === 0) return 0

    // Weighted average EV
    const totalEV = combos.reduce((sum, c) => sum + c.evReal, 0)
    return totalEV / combos.length
  }

  /**
   * Calculate diversification score (0-100)
   */
  private calculateDiversification(combos: GeneratedCombo[]): number {
    if (combos.length === 0) return 0

    let score = 50 // Base score

    // Market diversity
    const markets = new Set<string>()
    for (const combo of combos) {
      for (const leg of combo.legs) {
        if (String(leg.market).includes('GOAL') || String(leg.market).includes('1H')) {
          markets.add('GOALS')
        } else if (String(leg.market).includes('CORNER')) {
          markets.add('CORNERS')
        }
      }
    }
    score += markets.size * 10

    // League diversity
    const leagues = new Set<number>()
    for (const combo of combos) {
      for (const leg of combo.legs) {
        leagues.add(leg.leagueId)
      }
    }
    score += Math.min(20, leagues.size * 5)

    // Combo type diversity
    const types = new Set(combos.map((c) => c.type))
    score += Math.min(20, types.size * 5)

    return Math.min(100, score)
  }

  /**
   * Get recommended max combos based on bankroll
   */
  getRecommendedConstraints(bankroll: number): PortfolioConstraints {
    // Smaller bankrolls should be more conservative
    if (bankroll < 50) {
      return {
        maxCombosPerDay: 2,
        maxExposurePercent: 0.1,
        maxSameFixture: 1,
        maxSameLeague: 1,
        minComboScore: 50,
      }
    }

    if (bankroll < 200) {
      return {
        maxCombosPerDay: 2,
        maxExposurePercent: 0.12,
        maxSameFixture: 1,
        maxSameLeague: 2,
        minComboScore: 45,
      }
    }

    return DEFAULT_CONSTRAINTS
  }
}
