import { Injectable, Logger } from '@nestjs/common'
import { OpenAiAnalysisService } from './openai-analysis.service'
import { PredictionSnapshotDto } from './dto/prediction-snapshot.dto'

export interface PredictionResult {
  matchId: number
  liveProbability: number
  confidence: 'high' | 'moderate' | 'low'
  reasoning: string
}

export interface FullPredictionResult {
  matchId: number
  liveProbability: number
  historicalSupport: {
    similarMatches: number
    withGoals: number
    percentage: number
    comment: string
  }
  finalProbability: number
  confidence: 'high' | 'moderate' | 'low'
  reasoning: string
}

@Injectable()
export class PredictionEngineService {
  private readonly logger = new Logger(PredictionEngineService.name)

  constructor(private readonly openAiAnalysisService: OpenAiAnalysisService) {}

  generatePrediction(
    snapshot: PredictionSnapshotDto,
    options: { testMode?: boolean } = {}
  ): PredictionResult {
    const {
      id,
      minute,
      scoreHome,
      scoreAway,
      pressureScore,
      recentActivityScore,
      lastEventTypes,
    } = snapshot

    const { testMode = false } = options
    let probability = 0
    let confidence: 'low' | 'moderate' | 'high' = 'low'
    const reasons: string[] = []

    if (pressureScore >= 9.0) {
      probability += 60
      confidence = 'high'
      reasons.push(`Alta presión ofensiva (${pressureScore})`)
    } else if (pressureScore >= 7.5) {
      probability += 45
      confidence = 'moderate'
      reasons.push(`Presión ofensiva moderada (${pressureScore})`)
    } else {
      probability += 30
      confidence = 'low'
      reasons.push(`Presión baja (${pressureScore})`)
    }

    if (recentActivityScore >= 2.5) {
      probability += 15
      reasons.push(`Alta actividad reciente (${recentActivityScore})`)
    } else if (recentActivityScore >= 1.5) {
      probability += 10
      reasons.push(`Actividad reciente moderada (${recentActivityScore})`)
    } else {
      reasons.push(`Poca actividad reciente`)
    }

    const shotEvents = lastEventTypes.filter((e) =>
      ['Shot', 'Shot on Target', 'Corner'].includes(e)
    ).length
    if (shotEvents >= 2) {
      probability += 5
      reasons.push(`${shotEvents} eventos ofensivos recientes`)
    }

    probability = Math.min(Math.round(probability), 95)

    if (testMode) {
      this.logger.log(`🔍 [TEST MODE] Snapshot ID ${id}`)
      this.logger.log(
        `Minute: ${minute}, Score: ${scoreHome}-${scoreAway}, Pressure: ${pressureScore}, Recent: ${recentActivityScore}`
      )
      this.logger.log(`Prediction: ${probability}% (${confidence})`)
    }

    return {
      matchId: id,
      liveProbability: probability,
      confidence,
      reasoning: reasons.join('. '),
    }
  }

  async generateFullPrediction(
    snapshot: PredictionSnapshotDto,
    options: { testMode?: boolean } = {}
  ): Promise<FullPredictionResult> {
    const live = this.generatePrediction(snapshot, options)
    const historical = await this.openAiAnalysisService.findSimilarMatches(
      snapshot
    )

    const histPercent = historical?.percentage ?? 0

    const finalProbability =
      Math.round((live.liveProbability * 0.6 + histPercent * 0.4) * 10) / 10

    if (options.testMode) {
      this.logger.log(
        `📊 Fusion: Live ${live.liveProbability}% + Hist ${histPercent}% = Final ${finalProbability}%`
      )
      this.logger.debug(`💬 ${historical?.comment}`)
    }

    return {
      matchId: snapshot.id,
      liveProbability: live.liveProbability,
      historicalSupport: historical || {
        similarMatches: 0,
        withGoals: 0,
        percentage: 0,
        comment: 'Sin información histórica',
      },
      finalProbability,
      confidence: live.confidence,
      reasoning: `${live.reasoning}. ${historical?.comment || ''}`,
    }
  }
}
