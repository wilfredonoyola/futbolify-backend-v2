import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { FhgPrediction, FhgPredictionDocument } from '../schemas/fhg-prediction.schema'
import { FhgOdds, FhgOddsDocument } from '../schemas/fhg-odds.schema'
import { FhgLogService } from './fhg-log.service'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'
import { FhgSignal } from '../enums/fhg-signal.enum'
import {
  SIGNAL_A_THRESHOLD,
  SIGNAL_B_THRESHOLD,
  MIN_MARGIN_VALOR,
  STAKE_SIGNAL_A,
  STAKE_SIGNAL_B,
  STAKE_SIGNAL_C,
  MIN_P_REAL,
  MIN_EDGE_SCORE,
} from '../constants/fhg-config'

export interface ValueResult {
  predictionId: string
  oddsId: string
  matchId: string
  pReal: number
  bestOdds: number
  bookmaker: string
  marginValor: number
  signal: FhgSignal
  stakePercentage: number
  edgeScore: number
  isCandidate: boolean
  skipReason?: string
}

/**
 * FHG Value Service
 * Evaluates value by comparing P_real vs market odds
 *
 * marginValor = (bestOdds × P_real) - 1
 *
 * Signal Assignment:
 * - A: marginValor >= 8% (best value)
 * - B: marginValor >= 3% and < 8% (good value)
 * - C: marginValor >= 0% and < 3% (minimal value)
 * - NONE: marginValor < 0% (NO VALUE - skip)
 */
@Injectable()
export class FhgValueService {
  private readonly logger = new Logger(FhgValueService.name)

  constructor(
    @InjectModel(FhgPrediction.name)
    private predictionModel: Model<FhgPredictionDocument>,
    @InjectModel(FhgOdds.name)
    private oddsModel: Model<FhgOddsDocument>,
    private logService: FhgLogService
  ) {}

  /**
   * Evaluate value for a prediction given its odds
   */
  async evaluateValue(
    predictionId: string,
    oddsId: string
  ): Promise<ValueResult | null> {
    const [prediction, odds] = await Promise.all([
      this.predictionModel.findById(predictionId),
      this.oddsModel.findById(oddsId),
    ])

    if (!prediction) {
      await this.logService.warn(
        FhgLogCategory.VALUE,
        `Prediction not found: ${predictionId}`
      )
      return null
    }

    if (!odds) {
      await this.logService.warn(
        FhgLogCategory.VALUE,
        `Odds not found: ${oddsId}`,
        undefined,
        { matchId: prediction.matchId.toString() }
      )
      return null
    }

    // Get best available odds
    const bestOdds = odds.bestG1hYes
    const bookmaker = odds.bestG1hYesBookmaker

    if (!bestOdds || !bookmaker) {
      await this.logService.warn(
        FhgLogCategory.VALUE,
        `No G1H Yes odds available for ${prediction.homeTeam} vs ${prediction.awayTeam}`,
        undefined,
        { matchId: prediction.matchId.toString() }
      )
      return {
        predictionId,
        oddsId,
        matchId: prediction.matchId.toString(),
        pReal: prediction.pReal,
        bestOdds: 0,
        bookmaker: '',
        marginValor: -1,
        signal: FhgSignal.NONE,
        stakePercentage: 0,
        edgeScore: prediction.edgeScore,
        isCandidate: false,
        skipReason: 'No G1H Yes odds available',
      }
    }

    // Calculate margin valor
    const marginValor = bestOdds * prediction.pReal - 1

    // Determine signal
    const signal = this.calculateSignal(marginValor)

    // Calculate stake
    const stakePercentage = this.calculateStake(signal, prediction.edgeScore)

    // Log the evaluation
    await this.logService.logValue(
      prediction.matchId.toString(),
      prediction.pReal,
      bestOdds,
      marginValor,
      signal
    )

    // Check if it's a valid candidate
    let isCandidate = true
    let skipReason: string | undefined

    if (signal === FhgSignal.NONE) {
      isCandidate = false
      skipReason = `No value: marginValor ${(marginValor * 100).toFixed(2)}% < 0%`
    } else if (prediction.pReal < MIN_P_REAL) {
      isCandidate = false
      skipReason = `P_real too low: ${(prediction.pReal * 100).toFixed(2)}% < ${MIN_P_REAL * 100}%`
    } else if (prediction.edgeScore < MIN_EDGE_SCORE) {
      isCandidate = false
      skipReason = `Edge score too low: ${prediction.edgeScore} < ${MIN_EDGE_SCORE}`
    }

    if (!isCandidate) {
      await this.logService.info(
        FhgLogCategory.VALUE,
        `Skipped: ${prediction.homeTeam} vs ${prediction.awayTeam} - ${skipReason}`,
        undefined,
        { matchId: prediction.matchId.toString() }
      )
    }

    // Update prediction's edge breakdown with value score
    if (prediction.edgeBreakdown) {
      const valueScore = this.calculateValueScore(marginValor, bestOdds)
      await this.predictionModel.updateOne(
        { _id: prediction._id },
        { $set: { 'edgeBreakdown.valueScore': valueScore } }
      )
    }

    return {
      predictionId,
      oddsId,
      matchId: prediction.matchId.toString(),
      pReal: prediction.pReal,
      bestOdds,
      bookmaker,
      marginValor,
      signal,
      stakePercentage,
      edgeScore: prediction.edgeScore,
      isCandidate,
      skipReason,
    }
  }

  /**
   * Calculate signal based on margin valor
   */
  calculateSignal(marginValor: number): FhgSignal {
    if (marginValor >= SIGNAL_A_THRESHOLD) {
      return FhgSignal.A
    } else if (marginValor >= SIGNAL_B_THRESHOLD) {
      return FhgSignal.B
    } else if (marginValor >= MIN_MARGIN_VALOR) {
      return FhgSignal.C
    }
    return FhgSignal.NONE
  }

  /**
   * Calculate stake percentage based on signal and edge score
   */
  calculateStake(signal: FhgSignal, edgeScore: number): number {
    let baseStake: number

    switch (signal) {
      case FhgSignal.A:
        baseStake = STAKE_SIGNAL_A
        break
      case FhgSignal.B:
        baseStake = STAKE_SIGNAL_B
        break
      case FhgSignal.C:
        baseStake = STAKE_SIGNAL_C
        break
      case FhgSignal.NONE:
      default:
        return 0
    }

    // Adjust stake based on edge score (±20% max)
    const edgeMultiplier = 1 + (edgeScore - 50) / 250 // Range: 0.8 to 1.2
    const adjustedStake = baseStake * Math.max(0.8, Math.min(1.2, edgeMultiplier))

    return adjustedStake
  }

  /**
   * Calculate value score for edge breakdown (0-25)
   */
  private calculateValueScore(marginValor: number, odds: number): number {
    let score = 12 // Base

    // Margin valor contribution
    if (marginValor >= 0.1) score += 8
    else if (marginValor >= 0.05) score += 5
    else if (marginValor >= 0.03) score += 3
    else if (marginValor < 0) score -= 5

    // Odds in optimal range (1.40-1.55)
    if (odds >= 1.4 && odds <= 1.55) score += 5
    else if (odds >= 1.35 && odds <= 1.6) score += 3

    return Math.max(0, Math.min(25, score))
  }

  /**
   * Evaluate multiple predictions with their odds
   */
  async evaluateMultiple(
    pairs: Array<{ predictionId: string; oddsId: string }>
  ): Promise<ValueResult[]> {
    const results = await Promise.all(
      pairs.map((pair) => this.evaluateValue(pair.predictionId, pair.oddsId))
    )
    return results.filter((r): r is ValueResult => r !== null)
  }

  /**
   * Get candidates sorted by margin valor (descending)
   */
  async getCandidatesSorted(
    pairs: Array<{ predictionId: string; oddsId: string }>
  ): Promise<ValueResult[]> {
    const results = await this.evaluateMultiple(pairs)
    return results
      .filter((r) => r.isCandidate)
      .sort((a, b) => b.marginValor - a.marginValor)
  }
}
