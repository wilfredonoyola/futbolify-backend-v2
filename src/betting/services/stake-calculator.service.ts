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
 */
const DEFAULT_CONFIG: BankrollConfig = {
  totalBankroll: 100,
  maxStakePercent: 0.02, // 2% max per combo
  minStake: 1.0,
  kellyFraction: 0.20, // 20% of Kelly (conservative for combos)
  maxDailyExposure: 0.15, // 15% of bankroll per day
}

/**
 * Legs penalty multipliers
 * More legs = more conservative staking
 */
const LEGS_PENALTY: Record<number, number> = {
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

    // Sharp combos get 25% boost
    if (combo.sharpConfirmed) {
      stake *= 1.25
    }

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

    // Legs multiplier (more legs = more conservative)
    const legsMultiplier = LEGS_PENALTY[combo.legs.length] || 0.5

    // Type multiplier (some types are more reliable)
    const typeMultiplier = this.getTypeMultiplier(combo.type)

    const finalMultiplier = scoreMultiplier * legsMultiplier * typeMultiplier

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
   * Calculate stake for individual pick using Kelly Criterion
   * Simpler version for single bets (not combos)
   */
  calculatePickStake(
    probOwn: number,
    odds: number,
    edge: number,
    bankroll: number = DEFAULT_CONFIG.totalBankroll
  ): number {
    // Kelly formula: (b * p - q) / b
    const b = odds - 1 // Net odds
    const q = 1 - probOwn
    const kellyFull = (b * probOwn - q) / b

    // Kelly is negative = don't bet
    if (kellyFull <= 0) {
      return 0
    }

    // Use 25% of Kelly for individual picks (more aggressive than combos)
    const kellyFraction = 0.25

    // Edge-based multiplier: higher edge = higher stake
    let edgeMultiplier = 1.0
    if (edge >= 0.15) edgeMultiplier = 1.0
    else if (edge >= 0.10) edgeMultiplier = 0.85
    else if (edge >= 0.07) edgeMultiplier = 0.7
    else edgeMultiplier = 0.5

    let stake = bankroll * kellyFull * kellyFraction * edgeMultiplier

    // Apply limits: min $1, max 3% of bankroll for individual picks
    const maxPickStake = bankroll * 0.03
    stake = Math.max(DEFAULT_CONFIG.minStake, Math.min(maxPickStake, stake))

    // Round to 2 decimals
    return Math.round(stake * 100) / 100
  }
}
