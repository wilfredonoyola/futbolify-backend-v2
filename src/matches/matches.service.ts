import { Injectable, Logger } from '@nestjs/common'
import {
  LiveMatchOutputDto,
  LateMatchOptionsDto,
  TimelineEventDto,
  MatchState,
} from './dto'
import { CacheService } from './cache.service'
import * as SofascoreAPI from './utils/sofascore-api.util'
import * as SofascoreParser from './utils/sofascore-parser.util'
import * as SofascoreAnalyzer from './utils/sofascore-analyzer.util'
import { OpenAiAnalysisService } from './openai-analysis.service'
import { shouldAnalyzeWithGPT } from './utils/match-relevance.util'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name)
  private readonly requestConcurrency = 5

  constructor(
    private readonly cacheService: CacheService,
    private readonly openAiAnalysisService: OpenAiAnalysisService,
    private readonly configService: ConfigService
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

  // ✅ NUEVO método auxiliar para calcular estado simple del partido
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
        this.cacheService,
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
        const state = this.calculateSimpleState(minute, scoreHome, scoreAway) // ✅ aquí usamos el nuevo método

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
        this.cacheService,
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
        const result = await this.processMatch(match)
        if (result) {
          results.push(result)
          await new Promise((res) => setTimeout(res, 300)) // throttle entre partidos
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
        SofascoreAPI.fetchMatchStatistics(
          fixtureId,
          this.cacheService,
          this.configService
        ),
        SofascoreAPI.fetchMatchTimeline(
          fixtureId,
          this.cacheService,
          this.configService
        ),
      ])

      const stats = SofascoreParser.takeStatisticsSnapshot(statsData)
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

      const recentEvents = timeline.filter((event) => {
        const timeWindow = minute >= 75 ? 5 : minute >= 65 ? 7 : 8
        return event.minute >= minute - timeWindow
      })

      const recentActivityScore =
        SofascoreAnalyzer.calculateRecentActivityScore(recentEvents, minute)
      const finalPressureScore = basePressureScore + recentActivityScore

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
      })
    } catch (error) {
      this.logger.error(
        `❌ Error procesando partido ID ${match?.id}: ${error.message}`
      )
      return null
    }
  }
}
