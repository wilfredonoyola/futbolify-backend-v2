import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  PredictionRecord,
  PredictionRecordDocument,
} from './schemas/prediction-record.schema'
import { PredictionRecordDto } from './dto/prediction-record.dto'
import { ConfigService } from '@nestjs/config'
import * as SofascoreAPI from './utils/sofascore-client.util'
import {
  AccuracyByRangeDto,
  AccuracyByScoreDto,
  FullPredictionResultDto,
  PredictionAccuracyStatsDto,
} from './dto'
import { PredictionEngineService } from './prediction-engine.service'

@Injectable()
export class PredictionStorageService {
  private readonly logger = new Logger(PredictionStorageService.name)

  constructor(
    @InjectModel(PredictionRecord.name)
    private predictionModel: Model<PredictionRecordDocument>,
    private readonly configService: ConfigService,
    private readonly predictionEngineService: PredictionEngineService
  ) {}

  async savePrediction(
    prediction: FullPredictionResultDto,
    snapshot: {
      minute: number
      scoreHome: number
      scoreAway: number
      pressureScore: number
      recentActivityScore: number
    }
  ): Promise<void> {
    try {
      await this.predictionModel.create({
        matchId: prediction.matchId,
        minute: snapshot.minute,
        scoreHome: snapshot.scoreHome,
        scoreAway: snapshot.scoreAway,
        pressureScore: snapshot.pressureScore,
        recentActivityScore: snapshot.recentActivityScore,
        liveProbability: prediction.liveProbability,
        finalProbability: prediction.finalProbability,
        historicalComment: prediction.historicalSupport.comment,
        goalOccurred: false,
      })

      this.logger.log(`✅ Predicción guardada para match ${prediction.matchId}`)
    } catch (error) {
      this.logger.error(`❌ Error al guardar predicción: ${error.message}`)
    }
  }

  async findByMatchId(matchId: number): Promise<PredictionRecordDto[]> {
    const records = await this.predictionModel
      .find({ matchId })
      .sort({ createdAt: -1 })
      .exec()
    return records.map((record) => this.toDto(record))
  }

  async findAll(): Promise<PredictionRecordDto[]> {
    const records = await this.predictionModel
      .find()
      .sort({ createdAt: -1 })
      .limit(200)
      .exec()
    return records.map((record) => this.toDto(record))
  }

  private toDto(record: PredictionRecordDocument): PredictionRecordDto {
    return {
      id: record._id.toString(),
      matchId: record.matchId,
      minute: record.minute,
      scoreHome: record.scoreHome,
      scoreAway: record.scoreAway,
      pressureScore: record.pressureScore,
      recentActivityScore: record.recentActivityScore,
      liveProbability: record.liveProbability,
      finalProbability: record.finalProbability,
      historicalComment: record.historicalComment,
      goalOccurred: record.goalOccurred,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }

  async updateGoalOutcome(
    predictionId: string,
    goalOccurred: boolean
  ): Promise<boolean> {
    try {
      const result = await this.predictionModel.updateOne(
        { _id: predictionId },
        { $set: { goalOccurred } }
      )

      if (result.modifiedCount > 0) {
        this.logger.log(
          `✅ goalOccurred actualizado para ${predictionId}: ${goalOccurred}`
        )
        return true
      } else {
        this.logger.warn(
          `⚠️ No se encontró la predicción con ID ${predictionId}`
        )
        return false
      }
    } catch (error) {
      this.logger.error(`❌ Error actualizando goalOccurred: ${error.message}`)
      return false
    }
  }

  async checkPredictionOutcome(
    prediction: PredictionRecordDocument
  ): Promise<boolean> {
    try {
      const timelineData = await SofascoreAPI.fetchMatchTimeline(
        prediction.matchId,
        this.configService
      )

      const timeline = timelineData?.incidents || []

      const golPosterior = timeline.some((event: any) => {
        return (
          event.incidentType === 'goal' &&
          event.time?.minute > prediction.minute
        )
      })

      if (golPosterior) {
        await this.predictionModel.updateOne(
          { _id: prediction._id },
          { $set: { goalOccurred: true } }
        )

        this.logger.log(
          `⚽ Predicción ${prediction._id} marcada como correcta (gol después del min ${prediction.minute})`
        )

        return true
      }

      return false
    } catch (error) {
      this.logger.error(
        `❌ Error revisando resultado de predicción ${prediction._id}: ${error.message}`
      )
      return false
    }
  }

  async validatePendingPredictions(): Promise<number> {
    const thresholdMinutes = 10
    const since = new Date(Date.now() - thresholdMinutes * 60 * 1000)

    const pending = await this.predictionModel
      .find({
        goalOccurred: false,
        createdAt: { $lte: since },
      })
      .exec()

    let updatedCount = 0

    for (const prediction of pending) {
      const wasCorrect = await this.checkPredictionOutcome(prediction)
      if (wasCorrect) updatedCount++
      await new Promise((res) => setTimeout(res, 200)) // para evitar rate-limit
    }

    this.logger.log(
      `🔍 Validación completa: ${updatedCount} predicciones marcadas como correctas.`
    )

    return updatedCount
  }

  async getAccuracyStats(): Promise<PredictionAccuracyStatsDto> {
    const all = await this.predictionModel.find().exec()
    const totalPredictions = all.length
    const totalCorrect = all.filter((p) => p.goalOccurred).length
    const accuracyGlobal =
      totalPredictions > 0
        ? parseFloat(((totalCorrect / totalPredictions) * 100).toFixed(1))
        : 0

    // Agrupar por rango de finalProbability
    const ranges = [
      { label: '80-100%', min: 80, max: 100 },
      { label: '60-80%', min: 60, max: 80 },
      { label: '40-60%', min: 40, max: 60 },
      { label: '0-40%', min: 0, max: 40 },
    ]

    const byFinalProbability: AccuracyByRangeDto[] = ranges.map((r) => {
      const group = all.filter(
        (p) => p.finalProbability >= r.min && p.finalProbability < r.max
      )
      const correct = group.filter((p) => p.goalOccurred).length
      const accuracy =
        group.length > 0
          ? parseFloat(((correct / group.length) * 100).toFixed(1))
          : 0

      return {
        range: r.label,
        count: group.length,
        correct,
        accuracy,
      }
    })

    // Agrupar por marcador
    const scoreMap = new Map<string, { total: number; correct: number }>()
    for (const p of all) {
      const score = `${p.scoreHome}-${p.scoreAway}`
      const s = scoreMap.get(score) || { total: 0, correct: 0 }
      s.total++
      if (p.goalOccurred) s.correct++
      scoreMap.set(score, s)
    }

    const byScore: AccuracyByScoreDto[] = Array.from(scoreMap.entries()).map(
      ([score, { total, correct }]) => ({
        score,
        total,
        correct,
        accuracy: parseFloat(((correct / total) * 100).toFixed(1)),
      })
    )

    return {
      totalPredictions,
      totalCorrect,
      accuracyGlobal,
      byFinalProbability,
      byScore,
    }
  }

  async getRecentPredictionsForSniper(
    minutesAgo: number = 15
  ): Promise<PredictionRecordDto[]> {
    const since = new Date(Date.now() - minutesAgo * 60 * 1000)

    // Obtener predicciones recientes
    const recent = await this.predictionModel
      .find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .lean()

    // Agrupar por matchId y devolver solo la última por partido
    const uniqueByMatch = new Map<number, PredictionRecord>()

    for (const record of recent) {
      if (!uniqueByMatch.has(record.matchId)) {
        uniqueByMatch.set(record.matchId, record as PredictionRecord)
      }
    }

    return Array.from(uniqueByMatch.values()).map((r) => this.toDto(r as any))
  }
}
