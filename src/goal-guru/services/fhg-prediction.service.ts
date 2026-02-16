import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  FhgPrediction,
  FhgPredictionDocument,
  FhgFactor,
} from '../schemas/fhg-prediction.schema'
import { FhgMatch, FhgMatchDocument } from '../schemas/fhg-match.schema'
import { FhgTeam, FhgTeamDocument } from '../schemas/fhg-team.schema'
import { FhgLeague, FhgLeagueDocument } from '../schemas/fhg-league.schema'
import { FhgLogService } from './fhg-log.service'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'
import { FhgTier } from '../enums/fhg-tier.enum'
import {
  LEAGUE_TIER_FACTORS,
  WEIGHT_LEAGUE_AVG,
  WEIGHT_HOME_RATE,
  WEIGHT_AWAY_RATE,
  P_REAL_MIN,
  P_REAL_MAX,
  MOMENTUM_FACTOR_MIN,
  MOMENTUM_FACTOR_MAX,
  AGGRESSION_FACTOR_FAST,
  CONTEXT_FACTOR_HIGH_STAKES,
  FORM_FACTOR_PERFECT,
  FORM_FACTOR_GOOD,
  MIN_MATCHES_PLAYED,
  getFhgLeagueByCode,
} from '../constants/fhg-config'
import { FhgPredictionDetailDto } from '../dto/fhg-prediction-detail.dto'

interface PredictionResult {
  prediction: FhgPrediction
  created: boolean
}

/**
 * FHG Prediction Service
 * Calculates P_real (real probability) with explicit factors
 *
 * Formula:
 * P_base = (leagueAvg × 0.4) + (homeRate × 0.3) + (awayRate × 0.3)
 * P_real = P_base × leagueFactor × momentumFactor × aggressionFactor × vulnerabilityFactor × contextFactor × formFactor
 * P_real is clamped to [0.40, 0.95]
 */
@Injectable()
export class FhgPredictionService {
  private readonly logger = new Logger(FhgPredictionService.name)

  constructor(
    @InjectModel(FhgPrediction.name)
    private predictionModel: Model<FhgPredictionDocument>,
    @InjectModel(FhgMatch.name)
    private matchModel: Model<FhgMatchDocument>,
    @InjectModel(FhgTeam.name)
    private teamModel: Model<FhgTeamDocument>,
    @InjectModel(FhgLeague.name)
    private leagueModel: Model<FhgLeagueDocument>,
    private logService: FhgLogService
  ) {}

  /**
   * Calculate prediction for a match
   * @param matchId The match ID to calculate prediction for
   * @param forceRegenerate If true, delete existing prediction and regenerate
   */
  async calculateProbability(
    matchId: string,
    forceRegenerate = false
  ): Promise<PredictionResult | null> {
    const match = await this.matchModel.findById(matchId)
    if (!match) {
      await this.logService.warn(
        FhgLogCategory.PREDICTION,
        `Match not found: ${matchId}`,
        undefined,
        { matchId }
      )
      return null
    }

    // Check if prediction already exists
    const existing = await this.predictionModel.findOne({ matchId: match._id })
    if (existing) {
      if (forceRegenerate) {
        // Delete existing prediction to regenerate
        await this.predictionModel.deleteOne({ _id: existing._id })
        await this.logService.debug(
          FhgLogCategory.PREDICTION,
          `Deleted existing prediction for ${match.homeTeam} vs ${match.awayTeam} (force regenerate)`,
          undefined,
          { matchId }
        )
      } else {
        return { prediction: existing, created: false }
      }
    }

    const factors: FhgFactor[] = []
    const warnings: string[] = []

    // Get league config
    const leagueConfig = getFhgLeagueByCode(match.leagueCode)
    if (!leagueConfig) {
      await this.logService.warn(
        FhgLogCategory.PREDICTION,
        `League not configured: ${match.leagueCode}`,
        undefined,
        { matchId }
      )
      return null
    }

    // Get team stats
    const [homeTeam, awayTeam] = await Promise.all([
      this.teamModel.findOne({
        leagueCode: match.leagueCode,
        name: match.homeTeam,
      }),
      this.teamModel.findOne({
        leagueCode: match.leagueCode,
        name: match.awayTeam,
      }),
    ])

    // Calculate base rates (with fallbacks)
    // Convert avg goals to probability using Poisson: P(G1H) = 1 - e^(-λ)
    // where λ = avgG1H (average goals in first half)
    // This gives the probability of at least 1 goal in first half
    const leagueAvgG1H = 1 - Math.exp(-leagueConfig.avgG1H)

    // Default rates use league average (not arbitrary 0.5)
    let homeG1HRate = leagueAvgG1H
    let awayConcedeG1HRate = leagueAvgG1H

    if (homeTeam) {
      if (homeTeam.homeMatchesPlayed >= MIN_MATCHES_PLAYED) {
        homeG1HRate = homeTeam.homeG1HRate
      } else if (homeTeam.totalMatchesPlayed >= MIN_MATCHES_PLAYED) {
        homeG1HRate = homeTeam.overallG1HRate
        warnings.push(
          `Home team has only ${homeTeam.homeMatchesPlayed} home matches, using overall rate`
        )
      } else {
        warnings.push(
          `Home team has insufficient matches (${homeTeam.totalMatchesPlayed}), using league average`
        )
      }
    } else {
      warnings.push('Home team stats not found, using league average')
    }

    if (awayTeam) {
      if (awayTeam.awayMatchesPlayed >= MIN_MATCHES_PLAYED) {
        // Away concede rate = goals conceded in 1H / matches played
        const awayGoalsConceded1HPerMatch =
          awayTeam.awayGoalsConceded1H / awayTeam.awayMatchesPlayed
        awayConcedeG1HRate = Math.min(awayGoalsConceded1HPerMatch, 1)
      } else if (awayTeam.totalMatchesPlayed >= MIN_MATCHES_PLAYED) {
        const totalConceded =
          awayTeam.homeGoalsConceded1H + awayTeam.awayGoalsConceded1H
        awayConcedeG1HRate = Math.min(
          totalConceded / awayTeam.totalMatchesPlayed,
          1
        )
        warnings.push(
          `Away team has only ${awayTeam.awayMatchesPlayed} away matches, using overall rate`
        )
      } else {
        warnings.push(
          `Away team has insufficient matches (${awayTeam.totalMatchesPlayed}), using league average`
        )
      }
    } else {
      warnings.push('Away team stats not found, using league average')
    }

    // Step 1: Calculate P_base
    const pBase =
      WEIGHT_LEAGUE_AVG * leagueAvgG1H +
      WEIGHT_HOME_RATE * homeG1HRate +
      WEIGHT_AWAY_RATE * awayConcedeG1HRate

    await this.logService.debug(
      FhgLogCategory.PREDICTION,
      `P_base = (${leagueAvgG1H.toFixed(3)} × ${WEIGHT_LEAGUE_AVG}) + (${homeG1HRate.toFixed(3)} × ${WEIGHT_HOME_RATE}) + (${awayConcedeG1HRate.toFixed(3)} × ${WEIGHT_AWAY_RATE}) = ${pBase.toFixed(3)}`,
      { leagueAvgG1H, homeG1HRate, awayConcedeG1HRate, pBase },
      { matchId }
    )

    // Step 2: Calculate factors

    // League Factor
    const leagueFactor = LEAGUE_TIER_FACTORS[leagueConfig.tier]
    factors.push({
      name: 'leagueFactor',
      value: leagueFactor,
      reason: `${leagueConfig.tier} tier league (avg ${leagueConfig.avgG1H} G1H)`,
    })

    // Momentum Factor
    const momentumFactor = this.calculateMomentumFactor(homeTeam, awayTeam)
    factors.push({
      name: 'momentumFactor',
      value: momentumFactor.value,
      reason: momentumFactor.reason,
    })

    // Aggression Factor
    const aggressionFactor = this.calculateAggressionFactor(homeTeam)
    factors.push({
      name: 'aggressionFactor',
      value: aggressionFactor.value,
      reason: aggressionFactor.reason,
    })

    // Vulnerability Factor
    const vulnerabilityFactor = this.calculateVulnerabilityFactor(awayTeam)
    factors.push({
      name: 'vulnerabilityFactor',
      value: vulnerabilityFactor.value,
      reason: vulnerabilityFactor.reason,
    })

    // Context Factor
    const contextFactor = this.calculateContextFactor(match)
    factors.push({
      name: 'contextFactor',
      value: contextFactor.value,
      reason: contextFactor.reason,
    })

    // Form Factor
    const formFactor = this.calculateFormFactor(homeTeam, awayTeam)
    factors.push({
      name: 'formFactor',
      value: formFactor.value,
      reason: formFactor.reason,
    })

    // Step 3: Apply all factors
    const totalFactorMultiplier = factors.reduce((acc, f) => acc * f.value, 1)
    let pReal = pBase * totalFactorMultiplier

    // Clamp P_real
    pReal = Math.max(P_REAL_MIN, Math.min(P_REAL_MAX, pReal))

    // Step 4: Calculate edge score
    const edgeScore = this.calculateEdgeScore(
      homeTeam,
      awayTeam,
      pReal,
      warnings.length
    )

    await this.logService.logPrediction(
      matchId,
      pReal,
      pBase,
      factors.map((f) => ({ name: f.name, value: f.value, reason: f.reason }))
    )

    // Create prediction document
    const prediction = await this.predictionModel.create({
      matchId: new Types.ObjectId(matchId),
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      leagueCode: match.leagueCode,
      date: match.date,
      pBase,
      leagueAvgG1H,
      homeG1HRate,
      awayConcedeG1HRate,
      pReal,
      factors,
      leagueFactor,
      momentumFactor: momentumFactor.value,
      aggressionFactor: aggressionFactor.value,
      vulnerabilityFactor: vulnerabilityFactor.value,
      contextFactor: contextFactor.value,
      formFactor: formFactor.value,
      totalFactorMultiplier,
      edgeScore,
      edgeBreakdown: {
        dataQualityScore: this.calculateDataQualityScore(warnings.length),
        patternScore: this.calculatePatternScore(homeTeam, awayTeam),
        contextScore: Math.round(
          (contextFactor.value - 1) * 100 + (formFactor.value - 1) * 50
        ),
        valueScore: 0, // Will be set when evaluating value
      },
      confidenceLevel: this.getConfidenceLevel(edgeScore, warnings.length),
      warnings,
    })

    return { prediction, created: true }
  }

  /**
   * Calculate momentum factor based on recent vs season performance
   */
  private calculateMomentumFactor(
    homeTeam: FhgTeam | null,
    awayTeam: FhgTeam | null
  ): { value: number; reason: string } {
    if (!homeTeam?.recentG1HRate || !awayTeam) {
      return { value: 1.0, reason: 'Insufficient data for momentum calculation' }
    }

    const homeMomentum = homeTeam.recentG1HRate - homeTeam.overallG1HRate
    const effectiveMomentum = homeMomentum

    if (effectiveMomentum > 0.15) {
      return {
        value: Math.min(MOMENTUM_FACTOR_MAX, 1 + effectiveMomentum),
        reason: `Home team hot streak (recent ${(homeTeam.recentG1HRate * 100).toFixed(0)}% vs season ${(homeTeam.overallG1HRate * 100).toFixed(0)}%)`,
      }
    } else if (effectiveMomentum < -0.15) {
      return {
        value: Math.max(MOMENTUM_FACTOR_MIN, 1 + effectiveMomentum),
        reason: `Home team cold streak (recent ${(homeTeam.recentG1HRate * 100).toFixed(0)}% vs season ${(homeTeam.overallG1HRate * 100).toFixed(0)}%)`,
      }
    }

    return { value: 1.0, reason: 'Momentum neutral' }
  }

  /**
   * Calculate aggression factor based on average minute of first goal
   */
  private calculateAggressionFactor(homeTeam: FhgTeam | null): {
    value: number
    reason: string
  } {
    if (!homeTeam?.homeAvgMinuteFirstGoal) {
      return { value: 1.0, reason: 'No first goal timing data' }
    }

    if (homeTeam.homeAvgMinuteFirstGoal < 25) {
      return {
        value: AGGRESSION_FACTOR_FAST,
        reason: `Fast starters - avg first goal at ${homeTeam.homeAvgMinuteFirstGoal.toFixed(0)}'`,
      }
    } else if (homeTeam.homeAvgMinuteFirstGoal < 35) {
      return {
        value: 1.05,
        reason: `Decent pace - avg first goal at ${homeTeam.homeAvgMinuteFirstGoal.toFixed(0)}'`,
      }
    }

    return {
      value: 1.0,
      reason: `Normal pace - avg first goal at ${homeTeam.homeAvgMinuteFirstGoal.toFixed(0)}'`,
    }
  }

  /**
   * Calculate vulnerability factor based on away team's goals conceded
   */
  private calculateVulnerabilityFactor(awayTeam: FhgTeam | null): {
    value: number
    reason: string
  } {
    if (!awayTeam || awayTeam.awayMatchesPlayed < 5) {
      return { value: 1.0, reason: 'Insufficient away data' }
    }

    const avgConceded1H =
      awayTeam.awayGoalsConceded1H / awayTeam.awayMatchesPlayed

    if (avgConceded1H > 1.0) {
      return {
        value: 1.08,
        reason: `Highly vulnerable away - concedes ${avgConceded1H.toFixed(2)} goals/match in 1H`,
      }
    } else if (avgConceded1H > 0.7) {
      return {
        value: 1.04,
        reason: `Vulnerable away - concedes ${avgConceded1H.toFixed(2)} goals/match in 1H`,
      }
    } else if (avgConceded1H < 0.4) {
      return {
        value: 0.95,
        reason: `Solid away defense - concedes only ${avgConceded1H.toFixed(2)} goals/match in 1H`,
      }
    }

    return {
      value: 1.0,
      reason: `Average vulnerability - ${avgConceded1H.toFixed(2)} goals/match in 1H`,
    }
  }

  /**
   * Calculate context factor based on match importance
   */
  private calculateContextFactor(match: FhgMatch): {
    value: number
    reason: string
  } {
    const context = match.context
    if (!context) {
      return { value: 1.0, reason: 'No context data' }
    }

    let factor = 1.0
    const reasons: string[] = []

    if (
      context.motivation === 'TITLE' ||
      context.motivation === 'RELEGATION'
    ) {
      factor *= CONTEXT_FACTOR_HIGH_STAKES
      reasons.push(`${context.motivation} battle`)
    }

    if (context.isDerby) {
      factor *= 1.03
      reasons.push('Derby match')
    }

    if (context.homeRestDays && context.homeRestDays >= 6) {
      factor *= 1.02
      reasons.push('Home team well rested')
    }

    if (context.awayRestDays && context.awayRestDays <= 3) {
      factor *= 1.02
      reasons.push('Away team fatigued')
    }

    if (reasons.length === 0) {
      return { value: 1.0, reason: 'Standard match context' }
    }

    return { value: factor, reason: reasons.join(', ') }
  }

  /**
   * Calculate form factor based on recent results
   */
  private calculateFormFactor(
    homeTeam: FhgTeam | null,
    awayTeam: FhgTeam | null
  ): { value: number; reason: string } {
    if (!homeTeam?.recentForm || homeTeam.recentForm.length < 5) {
      return { value: 1.0, reason: 'Insufficient recent form data' }
    }

    const recentG1H = homeTeam.recentForm.filter((f) => f.hadG1H).length
    const total = homeTeam.recentForm.length

    if (recentG1H === 5) {
      return { value: FORM_FACTOR_PERFECT, reason: `Perfect G1H form: 5/5` }
    } else if (recentG1H >= 4) {
      return { value: FORM_FACTOR_GOOD, reason: `Strong G1H form: ${recentG1H}/${total}` }
    } else if (recentG1H <= 1) {
      return {
        value: 0.92,
        reason: `Poor G1H form: ${recentG1H}/${total}`,
      }
    }

    return { value: 1.0, reason: `Average G1H form: ${recentG1H}/${total}` }
  }

  /**
   * Calculate edge score (0-100)
   */
  private calculateEdgeScore(
    homeTeam: FhgTeam | null,
    awayTeam: FhgTeam | null,
    pReal: number,
    warningsCount: number
  ): number {
    let score = 50 // Base score

    // Data quality (+/- 15)
    score += this.calculateDataQualityScore(warningsCount) - 12

    // Pattern strength (+/- 20)
    score += this.calculatePatternScore(homeTeam, awayTeam) - 12

    // Probability strength (+/- 15)
    if (pReal >= 0.75) score += 15
    else if (pReal >= 0.70) score += 10
    else if (pReal >= 0.65) score += 5
    else if (pReal < 0.55) score -= 10

    return Math.max(0, Math.min(100, Math.round(score)))
  }

  private calculateDataQualityScore(warningsCount: number): number {
    if (warningsCount === 0) return 25
    if (warningsCount === 1) return 20
    if (warningsCount === 2) return 15
    return 10
  }

  private calculatePatternScore(
    homeTeam: FhgTeam | null,
    awayTeam: FhgTeam | null
  ): number {
    let score = 12 // Base

    if (homeTeam) {
      if (homeTeam.homeG1HRate > 0.7) score += 5
      else if (homeTeam.homeG1HRate > 0.6) score += 3

      if (homeTeam.homeAvgMinuteFirstGoal && homeTeam.homeAvgMinuteFirstGoal < 25)
        score += 4
    }

    if (awayTeam) {
      const avgConceded =
        awayTeam.awayMatchesPlayed > 0
          ? awayTeam.awayGoalsConceded1H / awayTeam.awayMatchesPlayed
          : 0
      if (avgConceded > 0.8) score += 4
    }

    return Math.min(25, score)
  }

  private getConfidenceLevel(
    edgeScore: number,
    warningsCount: number
  ): string {
    if (edgeScore >= 70 && warningsCount === 0) return 'HIGH'
    if (edgeScore >= 50 && warningsCount <= 1) return 'MEDIUM'
    return 'LOW'
  }

  /**
   * Get prediction by match ID
   */
  async getPredictionByMatchId(matchId: string): Promise<FhgPredictionDetailDto | null> {
    const prediction = await this.predictionModel.findOne({
      matchId: new Types.ObjectId(matchId),
    })

    if (!prediction) return null

    return this.toDto(prediction)
  }

  /**
   * Get prediction by ID
   */
  async getPredictionById(id: string): Promise<FhgPredictionDetailDto | null> {
    const prediction = await this.predictionModel.findById(id)
    if (!prediction) return null
    return this.toDto(prediction)
  }

  private toDto(prediction: FhgPrediction): FhgPredictionDetailDto {
    return {
      id: prediction._id.toString(),
      matchId: prediction.matchId.toString(),
      homeTeam: prediction.homeTeam,
      awayTeam: prediction.awayTeam,
      leagueCode: prediction.leagueCode,
      date: prediction.date,
      pBase: prediction.pBase,
      leagueAvgG1H: prediction.leagueAvgG1H,
      homeG1HRate: prediction.homeG1HRate,
      awayConcedeG1HRate: prediction.awayConcedeG1HRate,
      pReal: prediction.pReal,
      factors: prediction.factors.map((f) => ({
        name: f.name,
        value: f.value,
        reason: f.reason,
      })),
      leagueFactor: prediction.leagueFactor,
      momentumFactor: prediction.momentumFactor,
      aggressionFactor: prediction.aggressionFactor,
      vulnerabilityFactor: prediction.vulnerabilityFactor,
      contextFactor: prediction.contextFactor,
      formFactor: prediction.formFactor,
      totalFactorMultiplier: prediction.totalFactorMultiplier,
      edgeScore: prediction.edgeScore,
      edgeBreakdown: prediction.edgeBreakdown
        ? {
            dataQualityScore: prediction.edgeBreakdown.dataQualityScore,
            patternScore: prediction.edgeBreakdown.patternScore,
            contextScore: prediction.edgeBreakdown.contextScore,
            valueScore: prediction.edgeBreakdown.valueScore,
          }
        : undefined,
      confidenceLevel: prediction.confidenceLevel,
      warnings: prediction.warnings,
      createdAt: prediction.createdAt,
    }
  }
}
