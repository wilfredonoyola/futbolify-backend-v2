import { Injectable, Logger } from '@nestjs/common'
import {
  LiveMatchOutputDto,
  LateMatchOptionsDto,
  MatchState,
  PredictionSnapshotDto,
  LiveMatchPublicViewDto,
} from './dto'
import * as SofascoreAPI from './utils/sofascore-client.util'
import * as SofascoreParser from './utils/sofascore-parser.util'
import * as SofascoreAnalyzer from './utils/sofascore-analyzer.util'
import { OpenAiAnalysisService } from './openai-analysis.service'
import { shouldAnalyzeWithGPT } from './utils/match-relevance.util'
import { ConfigService } from '@nestjs/config'
import { PredictionStorageService } from './prediction-storage.service'
import { PredictionEngineService } from './prediction-engine.service'
import { PredictionThresholds } from './utils/prediction-thresholds.config'

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name)

  constructor(
    private readonly openAiAnalysisService: OpenAiAnalysisService,
    private readonly configService: ConfigService,
    private readonly predictionStorageService: PredictionStorageService,
    private readonly predictionEngineService: PredictionEngineService
  ) {}

  private createMatchDto(data: any): LiveMatchOutputDto {
    const dto = new LiveMatchOutputDto()
    dto.id = data.id
    dto.homeTeam = data.homeTeam
    dto.awayTeam = data.awayTeam
    dto.minute = data.minute
    dto.scoreHome = data.scoreHome
    dto.scoreAway = data.scoreAway
    dto.shots = data.stats?.totalShots ?? null
    dto.shotsOnTarget = data.stats?.shotsOnTarget ?? null
    dto.dangerousAttacks = data.stats?.dangerousAttacks ?? null
    dto.corners = data.stats
      ? data.stats.cornersHome + data.stats.cornersAway
      : null
    dto.pressureScore = data.pressureScore ?? null
    dto.recentActivityScore = data.recentActivityScore ?? null
    dto.hasRecentActivity = data.recentEvents
      ? data.recentEvents.length > 0
      : null
    dto.possession = data.stats?.possession ?? null
    dto.xG = data.xGTotal ?? null
    dto.attacks = data.stats?.attacks ?? null
    dto.bigChances = data.stats?.bigChancesTeams ?? null
    dto.isGoodForOver05 = data.isGoodForOver05 ?? null
    dto.isGoodForOver15 = data.isGoodForOver15 ?? null
    dto.marketAvailable = true
    dto.lastEventType = data.lastEventType ?? null
    dto.bookmakers = null
    dto.timeline = data.timeline ?? []
    dto.state = data.state ?? null
    dto.bettingAnalysis = data.bettingAnalysis ?? null
    return dto
  }

  private calculateSimpleState(
    minute: number,
    scoreHome: number,
    scoreAway: number
  ): MatchState {
    if (minute < 1) return MatchState.NotStarted
    if (minute < 45) return MatchState.FirstHalf
    if (minute >= 45 && minute < 60) return MatchState.HalfTime
    if (minute >= 60 && minute < 90) return MatchState.SecondHalf
    return MatchState.Finished
  }

  async getLiveMatchesSimple(): Promise<LiveMatchOutputDto[]> {
    try {
      const liveMatches = await SofascoreAPI.fetchLiveMatches(
        this.configService
      )
      if (!liveMatches.length) {
        this.logger.log('❌ No hay partidos en vivo.')
        return []
      }
      this.logger.log(`✅ ${liveMatches.length} partidos en vivo detectados.`)
      return liveMatches.map((match) => {
        const id = match.id
        const homeTeam = match.homeTeam.name
        const awayTeam = match.awayTeam.name
        const minute = SofascoreParser.calculateMinute(match)
        const scoreHome = match.homeScore.current
        const scoreAway = match.awayScore.current
        const state = this.calculateSimpleState(minute, scoreHome, scoreAway)

        return this.createMatchDto({
          id,
          homeTeam,
          awayTeam,
          minute,
          scoreHome,
          scoreAway,
          stats: null,
          pressureScore: null,
          recentActivityScore: null,
          recentEvents: [],
          lastEventType: null,
          timeline: [],
          isGoodForOver05: null,
          isGoodForOver15: null,
          state,
          bettingAnalysis: null,
          xGTotal: null,
        })
      })
    } catch (error) {
      this.logger.error(`❌ Error trayendo partidos LIVE: ${error.message}`)
      return []
    }
  }

  async getLateMatches(
    options: LateMatchOptionsDto = {}
  ): Promise<LiveMatchOutputDto[]> {
    try {
      const {
        minMinute = 65,
        minPressureScore = 8.0,
        requireRecentActivity = true,
        maxGoals = 3,
      } = options

      const liveMatches = await SofascoreAPI.fetchLiveMatches(
        this.configService
      )
      if (!liveMatches.length) {
        this.logger.log('❌ No hay partidos en vivo para evaluar como tardíos.')
        return []
      }

      const lateMatches = liveMatches.filter((match) => {
        const minute = SofascoreParser.calculateMinute(match)
        const lastPeriod = match.lastPeriod
        const totalGoals = match.homeScore.current + match.awayScore.current
        return (
          lastPeriod === 'period2' &&
          minute >= minMinute &&
          totalGoals <= maxGoals
        )
      })

      if (!lateMatches.length) {
        this.logger.log(`❌ No hay partidos tardíos (min >= ${minMinute}).`)
        return []
      }

      this.logger.log(`✅ ${lateMatches.length} partidos tardíos detectados.`)

      const results: LiveMatchOutputDto[] = []
      for (const match of lateMatches) {
        const minute = SofascoreParser.calculateMinute(match)
        const totalGoals = match.homeScore.current + match.awayScore.current

        // ⚠️ Evitá reanalizar partidos muy "dormidos"
        if (minute > 88) continue // demasiado tarde
        if (totalGoals > maxGoals) continue // ya desbordado
        if (
          minute > 80 &&
          match.lastEventTime &&
          match.lastEventTime < minute - 4
        )
          continue

        const result = await this.processMatch(match)
        if (result) {
          results.push(result)
          await new Promise((res) => setTimeout(res, 300))
        }
      }

      return results.filter((match) => {
        if (!match || !match.pressureScore) return false
        if (match.pressureScore < minPressureScore) return false
        if (
          requireRecentActivity &&
          match.minute >= 80 &&
          !match.hasRecentActivity
        )
          return false
        return true
      })
    } catch (error) {
      this.logger.error(`❌ Error trayendo partidos TARDÍOS: ${error.message}`)
      return []
    }
  }

  private async processMatch(match: any): Promise<LiveMatchOutputDto> {
    try {
      const fixtureId = match.id
      const homeTeam = match.homeTeam.name
      const awayTeam = match.awayTeam.name
      const minute = SofascoreParser.calculateMinute(match)
      const scoreHome = match.homeScore.current
      const scoreAway = match.awayScore.current
      const lastPeriod = match.lastPeriod

      const [statsData, timelineData] = await Promise.all([
        SofascoreAPI.fetchMatchStatistics(fixtureId, this.configService),
        SofascoreAPI.fetchMatchTimeline(fixtureId, this.configService),
      ])

      const stats = SofascoreParser.takeStatisticsSnapshot(statsData)

      this.logger.debug(
        `🧪 Snapshot parseado para ${homeTeam} vs ${awayTeam}:\n` +
          JSON.stringify(stats, null, 2)
      )

      const xGTotal = (stats.xG?.home ?? 0) + (stats.xG?.away ?? 0)

      const timeline = SofascoreParser.buildTimeline(
        timelineData.incidents || [],
        homeTeam,
        awayTeam
      )

      const lastEventTypes = timeline
        .sort((a, b) => b.minute - a.minute)
        .slice(0, 5)
        .map((event) => event.type)

      const basePressureScore = SofascoreAnalyzer.calculatePressureScore({
        totalShots: stats.totalShots,
        shotsOnTarget: stats.shotsOnTarget,
        dangerousAttacks: stats.dangerousAttacks,
        corners: stats.cornersHome + stats.cornersAway,
        totalShotsTeams: stats.totalShotsTeams,
        shotsOnTargetTeams: stats.shotsOnTargetTeams,
        shotsInsideBoxTeams: stats.shotsInsideBoxTeams,
        shotsOnTargetRatio: stats.shotsOnTargetRatio,
        possession: stats.possession,
        possessionDifference: stats.possessionDifference,
        bigChancesTeams: stats.bigChancesTeams,
        attacks: stats.attacks,
        xG: stats.xG,
        dangerFactor: stats.dangerFactor,
        shotsInsideBoxRatio: stats.shotsInsideBoxRatio,
        minute,
        lastEventTypes,
        scoreHome,
        scoreAway,
      })

      const timeWindow = minute >= 75 ? 5 : minute >= 65 ? 7 : 8
      const recentEvents = timeline.filter(
        (event) =>
          ['goal', 'shot', 'corner'].includes(event.type) &&
          event.minute >= minute - timeWindow
      )

      const recentActivityScore =
        SofascoreAnalyzer.calculateRecentActivityScore(recentEvents, minute)
      const finalPressureScore = basePressureScore + recentActivityScore

      const predictionSnapshot: PredictionSnapshotDto = {
        id: fixtureId,
        minute,
        scoreHome,
        scoreAway,
        pressureScore: finalPressureScore,
        recentActivityScore,
        lastEventTypes,
      }

      const predictionResult =
        await this.predictionEngineService.generateFullPrediction(
          predictionSnapshot,
          { testMode: true }
        )

      await this.predictionStorageService.savePrediction(predictionResult, {
        minute,
        scoreHome,
        scoreAway,
        pressureScore: finalPressureScore,
        recentActivityScore,
        homeTeam,
        awayTeam,
      })

      this.logger.log(
        `📊 FinalProb: ${predictionResult.finalProbability}% | Live: ${predictionResult.liveProbability}% | Hist: ${predictionResult.historicalSupport.percentage}%`
      )
      this.logger.debug(`📋 ${predictionResult.reasoning}`)

      const lastEventType = lastEventTypes[0] || null

      const isGoodForOver05 = SofascoreAnalyzer.isGoodForOver05(
        finalPressureScore,
        minute,
        scoreHome + scoreAway
      )

      const isGoodForOver15 = SofascoreAnalyzer.isGoodForOver15(
        finalPressureScore,
        minute,
        scoreHome + scoreAway
      )

      const state = SofascoreAnalyzer.determineMatchState({
        minute,
        scoreHome,
        scoreAway,
        pressureScore: finalPressureScore,
        isGoodForOver05,
        isGoodForOver15,
        lastPeriod,
      })

      // ✅ Red flags (ya corregidas)
      const lowShotAccuracy = stats.shotsOnTargetRatio < 0.25
      const mostlyLongShots = stats.shotsInsideBoxRatio < 0.3
      const highPossession = Math.max(
        stats.possession?.home ?? 0,
        stats.possession?.away ?? 0
      )
      const sterilePossession =
        highPossession > 65 && stats.dangerousAttacks < 40

      const redFlags = lowShotAccuracy || mostlyLongShots || sterilePossession

      if (redFlags) {
        this.logger.warn(
          `🚫 Partido filtrado por red flags: ${homeTeam} vs ${awayTeam}\n` +
            `   🟡 shotsOnTargetRatio: ${stats.shotsOnTargetRatio?.toFixed(
              2
            )} (mín 0.25)\n` +
            `   🔵 shotsInsideBoxRatio: ${stats.shotsInsideBoxRatio?.toFixed(
              2
            )} (mín 0.30)\n` +
            `   🟣 posesión alta (>65%): ${Math.max(
              stats.possession?.home ?? 0,
              stats.possession?.away ?? 0
            )}% con ${stats.dangerousAttacks} ataques peligrosos (mín 40)`
        )

        //  return null
      }

      let bettingAnalysis = null
      if (
        shouldAnalyzeWithGPT({
          minute,
          scoreHome,
          scoreAway,
          pressureScore: finalPressureScore,
          marketAvailable: true,
        })
      ) {
        bettingAnalysis = await this.openAiAnalysisService.analyzeMatch({
          id: fixtureId,
          homeTeam,
          awayTeam,
          minute,
          scoreHome,
          scoreAway,
          shots: stats.totalShots,
          shotsOnTarget: stats.shotsOnTarget,
          dangerousAttacks: stats.dangerousAttacks,
          corners: stats.cornersHome + stats.cornersAway,
          xG: xGTotal,
          pressureScore: finalPressureScore,
          hasRecentActivity: recentEvents.length > 0,
          marketAvailable: true,
          lastEventType,
          lastEvents: recentEvents.map((e) => ({
            type: e.type,
            minute: e.minute,
          })),
        })
      }

      return this.createMatchDto({
        id: fixtureId,
        homeTeam,
        awayTeam,
        minute,
        scoreHome,
        scoreAway,
        stats,
        pressureScore: finalPressureScore,
        recentActivityScore,
        recentEvents,
        lastEventType,
        timeline,
        isGoodForOver05,
        isGoodForOver15,
        state,
        bettingAnalysis,
        xGTotal,
        finalProbability: predictionResult.finalProbability,
        historicalComment: predictionResult.historicalSupport.comment,
      })
    } catch (error) {
      this.logger.error(
        `❌ Error procesando partido ID ${match?.id}: ${error.message}`
      )
      return null
    }
  }

  async getLiveMatchAnalysis(): Promise<LiveMatchPublicViewDto[]> {
    const matches = await this.getLateMatches()

    const visible = matches.filter((match) => {
      const prob = match.finalProbability ?? 0
      const confidence = match.bettingAnalysis?.confidence ?? 0
      return (
        prob >= PredictionThresholds.SHOW_MATCHES_FROM &&
        confidence >= PredictionThresholds.CONFIDENCE_MIN
      )
    })

    this.logger.log(`📡 SniperView: ${visible.length} visible matches`)

    return visible.map((match) => this.mapToPublicView(match))
  }

  private mapToPublicView(match: LiveMatchOutputDto): LiveMatchPublicViewDto {
    const {
      finalProbability = 0,
      pressureScore = 0,
      recentActivityScore = 0,
    } = match

    let rawState: 'hot' | 'active' | 'passive' = 'passive'
    if (finalProbability >= 70) rawState = 'hot'
    else if (pressureScore >= 7.5 || recentActivityScore >= 2)
      rawState = 'active'

    let rawDecision: 'bet' | 'observe' | 'ignore' = 'ignore'
    if (finalProbability >= 70) rawDecision = 'bet'
    else if (finalProbability >= 50) rawDecision = 'observe'

    return {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      minute: match.minute!,
      scoreHome: match.scoreHome,
      scoreAway: match.scoreAway,
      pressureScore,
      recentActivityScore,
      finalProbability,
      historicalComment: match.historicalComment,
      reasoning: match.bettingAnalysis?.reason,
      hasRecentActivity: match.hasRecentActivity ?? false,
      isLateMatch: match.minute! >= 65,
      lastEventTypes: match.timeline?.slice(-5).map((e) => e.type) || [],
      lastUpdate: new Date(),
      state:
        rawState === 'hot'
          ? 'caliente'
          : rawState === 'active'
          ? 'activo'
          : 'pasivo',
      decision:
        rawDecision === 'bet'
          ? 'apostar'
          : rawDecision === 'observe'
          ? 'observar'
          : 'retirarse',
    }
  }

  async getRecentSniperViewFromStorage(): Promise<LiveMatchPublicViewDto[]> {
    const recent =
      await this.predictionStorageService.getRecentPredictionsForSniper()

    return recent.map((record) => {
      let state: 'caliente' | 'activo' | 'pasivo' = 'pasivo'
      if (record.finalProbability >= 70) state = 'caliente'
      else if (record.pressureScore >= 7.5 || record.recentActivityScore >= 2)
        state = 'activo'

      let decision: 'apostar' | 'observar' | 'retirarse' = 'retirarse'
      if (record.finalProbability >= 70) decision = 'apostar'
      else if (record.finalProbability >= 50) decision = 'observar'

      return {
        matchId: record.matchId,
        homeTeam: record.homeTeam, // opcional si tenés cache de nombres
        awayTeam: record.awayTeam,
        minute: record.minute,
        scoreHome: record.scoreHome,
        scoreAway: record.scoreAway,
        pressureScore: record.pressureScore,
        recentActivityScore: record.recentActivityScore,
        finalProbability: record.finalProbability,
        historicalComment: record.historicalComment,
        reasoning: undefined,
        hasRecentActivity: record.recentActivityScore > 0,
        isLateMatch: record.minute >= 65,
        lastEventTypes: [],
        lastUpdate: record.updatedAt,
        state,
        decision,
      }
    })
  }
}
