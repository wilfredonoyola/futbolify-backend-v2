import { Injectable, Logger } from '@nestjs/common'
import { GeneratedCombo } from './combo-engine.service'
import { ComboType, ComboScoreLevel } from '../enums/betting.enums'

/**
 * Stake calculation result
 */
export interface StakeResult {
  recommendedStake: number
  stakePercent: number
  kellyFull: number
  kellyFraction: number
  multipliers: StakeMultipliers
  reasoning: string
}

/**
 * Multipliers applied to Kelly calculation
 */
export interface StakeMultipliers {
  scoreMultiplier: number
  legsMultiplier: number
  typeMultiplier: number
  finalMultiplier: number
}

/**
 * Bankroll management config
 */
export interface BankrollConfig {
  totalBankroll: number
  maxStakePercent: number // Max % of bankroll per combo
  minStake: number // Minimum stake in $
  kellyFraction: number // Fraction of Kelly to use (default 0.20)
  maxDailyExposure: number // Max % of bankroll per day
}

/**
 * Default bankroll config
 * UPDATED: Kelly fraction reduced from 20% to 10% for parlays
 * Professional standard is 10-15% Kelly for multi-leg bets
 */
const DEFAULT_CONFIG: BankrollConfig = {
  totalBankroll: 100,
  maxStakePercent: 0.02, // 2% max per combo
  minStake: 1.0,
  kellyFraction: 0.10, // 10% of Kelly - professional standard for parlays
  maxDailyExposure: 0.15, // 15% of bankroll per day
}

/**
 * Calculate variance-based legs penalty
 * More legs = exponentially more variance = need smaller stakes
 *
 * Based on variance scaling: penalty = numLegs^(-exponent)
 * - With correlation: exponent = 0.5 (less penalty due to correlated outcomes)
 * - Without correlation: exponent = 0.6 (more penalty for independent legs)
 *
 * Results:
 * - 2 legs: ~0.71 (before: 1.0) - 29% reduction
 * - 3 legs: ~0.58 (before: 0.8) - 42% reduction
 * - 4 legs: ~0.50 (before: 0.65) - 50% reduction
 */
function calculateLegsPenalty(numLegs: number, hasCorrelation: boolean = false): number {
  const exponent = hasCorrelation ? 0.5 : 0.6
  return Math.max(0.25, Math.pow(numLegs, -exponent))
}

// Keep legacy constant for reference/comparison (not used)
const LEGS_PENALTY_LEGACY: Record<number, number> = {
  2: 1.0,
  3: 0.8,
  4: 0.65,
}

/**
 * Type-specific stake limits
 */
const TYPE_STAKE_LIMITS: Record<ComboType, number> = {
  [ComboType.GEMELA]: 0.015, // 1.5% bankroll
  [ComboType.GEMELA_INVERTIDA]: 0.01, // 1.0% bankroll
  [ComboType.CROSS_MERCADO]: 0.01, // 1.0% bankroll
  [ComboType.CROSS_LIGA]: 0.01, // 1.0% bankroll
  [ComboType.TRIPLE_CORRELACIONADO]: 0.0075, // 0.75% bankroll
  [ComboType.DOBLE_GEMELA]: 0.0075, // 0.75% bankroll
  [ComboType.SHARP_GEMELA]: 0.02, // 2.0% bankroll (higher for sharp)
  [ComboType.SHARP_CROSS_MERCADO]: 0.0125, // 1.25% bankroll
}

@Injectable()
export class StakeCalculatorService {
  private readonly logger = new Logger(StakeCalculatorService.name)

  /**
   * Calculate recommended stake using Kelly Criterion
   * Implements kelly_combo from COMBINADAS doc section 7
   */
  calculateStake(
    combo: GeneratedCombo,
    config: Partial<BankrollConfig> = {}
  ): StakeResult {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    // Use real probability with correlation
    const p = combo.pJoint
    const b = combo.combinedOdds - 1 // Net odds

    // Kelly formula: (b * p - q) / b
    const q = 1 - p
    const kellyFull = (b * p - q) / b

    // Kelly is negative = don't bet
    if (kellyFull <= 0) {
      return {
        recommendedStake: 0,
        stakePercent: 0,
        kellyFull,
        kellyFraction: 0,
        multipliers: {
          scoreMultiplier: 0,
          legsMultiplier: 0,
          typeMultiplier: 0,
          finalMultiplier: 0,
        },
        reasoning: 'Kelly criterion is negative - no bet recommended',
      }
    }

    // Apply Kelly fraction (conservative for combos)
    const kellyFraction = kellyFull * cfg.kellyFraction

    // Calculate multipliers
    const multipliers = this.calculateMultipliers(combo)

    // Calculate stake
    let stake = cfg.totalBankroll * kellyFraction * multipliers.finalMultiplier

    // Apply type-specific limit
    const typeLimit = TYPE_STAKE_LIMITS[combo.type] || 0.01
    const maxByType = cfg.totalBankroll * typeLimit

    // NOTE: Removed double sharp boost (was 1.25x)
    // Sharp bonus is already included in type multiplier (1.1x for SHARP_GEMELA)
    // Having both led to 1.1 * 1.25 = 1.375x which was too aggressive

    // Apply limits
    const maxStake = Math.min(
      cfg.totalBankroll * cfg.maxStakePercent,
      maxByType
    )
    stake = Math.max(cfg.minStake, Math.min(maxStake, stake))

    // Round to 2 decimals
    stake = Math.round(stake * 100) / 100

    const stakePercent = stake / cfg.totalBankroll

    this.logger.debug(
      `Stake for ${combo.type}: $${stake} (${(stakePercent * 100).toFixed(1)}%), ` +
        `Kelly=${(kellyFull * 100).toFixed(1)}%, ` +
        `Fraction=${(kellyFraction * 100).toFixed(1)}%`
    )

    return {
      recommendedStake: stake,
      stakePercent,
      kellyFull,
      kellyFraction,
      multipliers,
      reasoning: this.getStakeReasoning(combo, stake, multipliers),
    }
  }

  /**
   * Calculate all stake multipliers
   */
  private calculateMultipliers(combo: GeneratedCombo): StakeMultipliers {
    // Score multiplier
    const scoreMultiplier = this.getScoreMultiplier(combo.score)

    // Legs multiplier using variance-based formula
    // Check if combo has correlation (from correlation field or type)
    const hasCorrelation = (combo.correlation?.base || 0) > 0.1 ||
      combo.type === ComboType.GEMELA ||
      combo.type === ComboType.SHARP_GEMELA
    const legsMultiplier = calculateLegsPenalty(combo.legs.length, hasCorrelation)

    // Type multiplier (some types are more reliable)
    const typeMultiplier = this.getTypeMultiplier(combo.type)

    // Calculate final multiplier with safety cap to prevent over-betting
    const rawMultiplier = scoreMultiplier * legsMultiplier * typeMultiplier
    const finalMultiplier = Math.min(1.2, rawMultiplier) // Cap at 1.2x

    return {
      scoreMultiplier,
      legsMultiplier,
      typeMultiplier,
      finalMultiplier,
    }
  }

  /**
   * Get multiplier based on combo score
   */
  private getScoreMultiplier(score: number): number {
    if (score >= 80) return 1.0 // ELITE
    if (score >= 65) return 0.8 // FUERTE
    if (score >= 50) return 0.6 // SOLIDA
    if (score >= 35) return 0.4 // MARGINAL
    return 0.0 // DESCARTAR
  }

  /**
   * Get multiplier based on combo type
   */
  private getTypeMultiplier(type: ComboType): number {
    switch (type) {
      case ComboType.SHARP_GEMELA:
        return 1.1 // Most reliable
      case ComboType.GEMELA:
        return 1.0
      case ComboType.SHARP_CROSS_MERCADO:
        return 1.0
      case ComboType.CROSS_MERCADO:
        return 0.95
      case ComboType.CROSS_LIGA:
        return 0.9
      case ComboType.TRIPLE_CORRELACIONADO:
        return 0.85
      case ComboType.DOBLE_GEMELA:
        return 0.8
      case ComboType.GEMELA_INVERTIDA:
        return 0.85
      default:
        return 0.9
    }
  }

  /**
   * Get score level classification
   */
  getScoreLevel(score: number): ComboScoreLevel {
    if (score >= 80) return ComboScoreLevel.ELITE
    if (score >= 65) return ComboScoreLevel.FUERTE
    if (score >= 50) return ComboScoreLevel.SOLIDA
    if (score >= 35) return ComboScoreLevel.MARGINAL
    return ComboScoreLevel.DESCARTAR
  }

  /**
   * Calculate total daily exposure
   */
  calculateDailyExposure(
    stakes: number[],
    bankroll: number = DEFAULT_CONFIG.totalBankroll
  ): {
    totalStake: number
    exposurePercent: number
    withinLimit: boolean
  } {
    const totalStake = stakes.reduce((sum, s) => sum + s, 0)
    const exposurePercent = totalStake / bankroll

    return {
      totalStake,
      exposurePercent,
      withinLimit: exposurePercent <= DEFAULT_CONFIG.maxDailyExposure,
    }
  }

  /**
   * Distribute remaining budget across combos
   */
  distributeBudget(
    combos: GeneratedCombo[],
    remainingBudget: number,
    config: Partial<BankrollConfig> = {}
  ): Map<string, number> {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const stakes = new Map<string, number>()
    let budgetLeft = remainingBudget

    // Sort by score (best combos first)
    const sorted = [...combos].sort((a, b) => b.score - a.score)

    for (const combo of sorted) {
      if (budgetLeft <= cfg.minStake) break

      const stakeResult = this.calculateStake(combo, {
        ...cfg,
        totalBankroll: budgetLeft,
      })

      if (stakeResult.recommendedStake > 0) {
        const actualStake = Math.min(stakeResult.recommendedStake, budgetLeft)
        stakes.set(combo.id, actualStake)
        budgetLeft -= actualStake
      }
    }

    return stakes
  }

  /**
   * Get expected value of the stake
   */
  calculateExpectedProfit(
    stake: number,
    combo: GeneratedCombo
  ): {
    expectedProfit: number
    expectedLoss: number
    expectedValue: number
    roi: number
  } {
    const winProb = combo.pJoint
    const loseProb = 1 - winProb
    const potentialWin = stake * (combo.combinedOdds - 1)
    const potentialLoss = stake

    const expectedProfit = winProb * potentialWin
    const expectedLoss = loseProb * potentialLoss
    const expectedValue = expectedProfit - expectedLoss
    const roi = expectedValue / stake

    return {
      expectedProfit,
      expectedLoss,
      expectedValue,
      roi,
    }
  }

  /**
   * Generate stake reasoning string
   */
  private getStakeReasoning(
    combo: GeneratedCombo,
    stake: number,
    multipliers: StakeMultipliers
  ): string {
    const level = this.getScoreLevel(combo.score)
    const parts: string[] = []

    parts.push(`Score ${combo.score} (${level})`)
    parts.push(`${combo.legs.length} legs`)
    parts.push(`${combo.type}`)

    if (combo.sharpConfirmed) {
      parts.push('SHARP confirmed +25%')
    }

    parts.push(`Final multiplier: ${multipliers.finalMultiplier.toFixed(2)}`)

    return parts.join(', ')
  }

  /**
   * Get recommended stake table for display
   */
  getStakeTable(bankroll: number): Array<{
    scoreRange: string
    level: ComboScoreLevel
    stakePercent: string
    stakeAmount: string
  }> {
    return [
      {
        scoreRange: '80-100',
        level: ComboScoreLevel.ELITE,
        stakePercent: '1.5-2%',
        stakeAmount: `$${(bankroll * 0.015).toFixed(2)}-$${(bankroll * 0.02).toFixed(2)}`,
      },
      {
        scoreRange: '65-79',
        level: ComboScoreLevel.FUERTE,
        stakePercent: '1-1.5%',
        stakeAmount: `$${(bankroll * 0.01).toFixed(2)}-$${(bankroll * 0.015).toFixed(2)}`,
      },
      {
        scoreRange: '50-64',
        level: ComboScoreLevel.SOLIDA,
        stakePercent: '0.5-1%',
        stakeAmount: `$${(bankroll * 0.005).toFixed(2)}-$${(bankroll * 0.01).toFixed(2)}`,
      },
      {
        scoreRange: '35-49',
        level: ComboScoreLevel.MARGINAL,
        stakePercent: '0.5%',
        stakeAmount: `$${(bankroll * 0.005).toFixed(2)}`,
      },
      {
        scoreRange: '<35',
        level: ComboScoreLevel.DESCARTAR,
        stakePercent: '0%',
        stakeAmount: '$0',
      },
    ]
  }

  /**
   * Validate if stake is within acceptable limits
   */
  validateStake(
    stake: number,
    bankroll: number = DEFAULT_CONFIG.totalBankroll
  ): {
    valid: boolean
    reason?: string
  } {
    if (stake < DEFAULT_CONFIG.minStake) {
      return {
        valid: false,
        reason: `Stake $${stake} below minimum $${DEFAULT_CONFIG.minStake}`,
      }
    }

    if (stake > bankroll * DEFAULT_CONFIG.maxStakePercent) {
      return {
        valid: false,
        reason: `Stake $${stake} exceeds max ${DEFAULT_CONFIG.maxStakePercent * 100}% of bankroll`,
      }
    }

    return { valid: true }
  }

  /**
   * Drawdown Protection Configuration
   */
  static readonly DRAWDOWN_CONFIG = {
    maxDrawdownPct: 0.15, // 15% max drawdown before pause
    maxConsecutiveLosses: 7, // Pause after 7 consecutive losses
    lossesBeforeReduction: 3, // Start reducing stakes after 3 losses
    stakeReductionOnLoss: 0.5, // 50% reduction per loss after threshold
  }

  /**
   * Check if drawdown protection should be activated
   * Returns whether to pause betting and/or adjust stake size
   *
   * This is a critical risk management function that:
   * 1. Pauses betting if drawdown >= 15% of peak bankroll
   * 2. Pauses betting after 7+ consecutive losses
   * 3. Reduces stake size progressively after 3+ consecutive losses
   *
   * @param currentBankroll Current bankroll amount
   * @param peakBankroll Highest bankroll reached (for drawdown calculation)
   * @param consecutiveLosses Number of consecutive losses
   * @param config Optional custom configuration
   */
  checkDrawdownProtection(
    currentBankroll: number,
    peakBankroll: number,
    consecutiveLosses: number,
    config: {
      maxDrawdownPct?: number
      maxConsecutiveLosses?: number
      lossesBeforeReduction?: number
      stakeReductionOnLoss?: number
    } = {}
  ): {
    shouldPause: boolean
    stakeAdjustment: number
    reason?: string
    severity: 'none' | 'warning' | 'critical'
  } {
    const cfg = { ...StakeCalculatorService.DRAWDOWN_CONFIG, ...config }

    // Calculate current drawdown from peak
    const drawdown = peakBankroll > 0
      ? (peakBankroll - currentBankroll) / peakBankroll
      : 0

    // CRITICAL: Pause if drawdown >= 15%
    if (drawdown >= cfg.maxDrawdownPct) {
      this.logger.warn(
        `CRITICAL: Drawdown ${(drawdown * 100).toFixed(1)}% >= ${cfg.maxDrawdownPct * 100}% threshold`
      )
      return {
        shouldPause: true,
        stakeAdjustment: 0,
        reason: `Drawdown ${(drawdown * 100).toFixed(1)}% >= ${cfg.maxDrawdownPct * 100}% - pausing to protect bankroll`,
        severity: 'critical',
      }
    }

    // CRITICAL: Pause if 7+ consecutive losses
    if (consecutiveLosses >= cfg.maxConsecutiveLosses) {
      this.logger.warn(
        `CRITICAL: ${consecutiveLosses} consecutive losses >= ${cfg.maxConsecutiveLosses} threshold`
      )
      return {
        shouldPause: true,
        stakeAdjustment: 0,
        reason: `${consecutiveLosses} consecutive losses - pausing to break streak`,
        severity: 'critical',
      }
    }

    // WARNING: Reduce stake after 3+ consecutive losses
    if (consecutiveLosses >= cfg.lossesBeforeReduction) {
      // Each loss after threshold halves the stake
      // 3 losses: 50%, 4 losses: 25%, 5 losses: 12.5%, 6 losses: 6.25%
      const lossesOverThreshold = consecutiveLosses - cfg.lossesBeforeReduction + 1
      const factor = Math.pow(cfg.stakeReductionOnLoss, lossesOverThreshold)
      const adjustedFactor = Math.max(0.25, factor) // Never go below 25%

      this.logger.warn(
        `Reducing stake to ${(adjustedFactor * 100).toFixed(0)}% after ${consecutiveLosses} consecutive losses`
      )

      return {
        shouldPause: false,
        stakeAdjustment: adjustedFactor,
        reason: `${consecutiveLosses} consecutive losses - stake reduced to ${(adjustedFactor * 100).toFixed(0)}%`,
        severity: 'warning',
      }
    }

    // No protection needed
    return {
      shouldPause: false,
      stakeAdjustment: 1.0,
      severity: 'none',
    }
  }

  /**
   * Calculate stake for individual pick based on edge
   * Stakes are in clean unit increments (0.25u, 0.5u, 0.75u, 1u, etc.)
   *
   * Stake scale based on edge:
   * - Edge >= 20%: 1.5u (very high confidence)
   * - Edge >= 15%: 1u (high confidence)
   * - Edge >= 10%: 0.75u (good confidence)
   * - Edge >= 7%:  0.5u (moderate confidence)
   * - Edge >= 5%:  0.25u (minimum)
   *
   * @param probOwn Probability from our model
   * @param odds Decimal odds
   * @param edge Edge percentage (0.05 = 5%)
   * @param bankroll Current bankroll
   * @param options Optional settings for fixed stake and unit value
   */
  calculatePickStake(
    probOwn: number,
    odds: number,
    edge: number,
    bankroll: number = DEFAULT_CONFIG.totalBankroll,
    options?: {
      useFixedStake?: boolean
      fixedStake?: number
      unitValue?: number  // Value of 1 unit in dollars (default $10)
    }
  ): number {
    const unitValue = options?.unitValue || 10  // Default 1u = $10

    // If fixed stake is configured and enabled, use it directly
    if (options?.useFixedStake && options?.fixedStake && options.fixedStake > 0) {
      this.logger.debug(`Using fixed stake: $${options.fixedStake}`)
      return Math.round(options.fixedStake * 100) / 100
    }

    // Edge-based stake in units (simple and clear for bettors)
    let stakeUnits: number
    if (edge >= 0.20) {
      stakeUnits = 1.5  // Very high edge: 1.5u
    } else if (edge >= 0.15) {
      stakeUnits = 1.0  // High edge: 1u
    } else if (edge >= 0.10) {
      stakeUnits = 0.75 // Good edge: 0.75u
    } else if (edge >= 0.07) {
      stakeUnits = 0.5  // Moderate edge: 0.5u
    } else {
      stakeUnits = 0.25 // Minimum: 0.25u
    }

    // Bonus for very high probability (>80%)
    if (probOwn >= 0.80) {
      stakeUnits = Math.min(2.0, stakeUnits + 0.25)
    }

    // Convert to dollars
    const stake = stakeUnits * unitValue

    this.logger.debug(`Stake: ${stakeUnits}u ($${stake.toFixed(2)}) - Edge: ${(edge * 100).toFixed(1)}%, Prob: ${(probOwn * 100).toFixed(0)}%`)

    return Math.round(stake * 100) / 100
  }
}
