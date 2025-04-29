import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'
import { LiveMatchOutputDto, TimelineEventDto, MatchState } from './dto'
import { CacheService } from './cache.service'

@Injectable()
export class MatchesServiceSofascore {
  private readonly logger = new Logger(MatchesServiceSofascore.name)
  private readonly apiKey = process.env.RAPIDAPI_KEY_SOFA
  private readonly api: AxiosInstance
  private readonly requestConcurrency = 5
  private readonly retryAttempts = 3
  private readonly retryDelay = 1000

  constructor(private readonly cacheService: CacheService) {
    this.api = axios.create({
      baseURL: 'https://sofascore.p.rapidapi.com',
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'sofascore.p.rapidapi.com',
      },
      timeout: 5000,
    })
  }

  async getLiveMatchesSimple(): Promise<LiveMatchOutputDto[]> {
    try {
      const liveMatches = await this.fetchLiveMatches()

      if (!liveMatches.length) {
        this.logger.log('❌ No hay partidos en vivo.')
        return []
      }

      this.logger.log(`✅ ${liveMatches.length} partidos en vivo detectados.`)

      const detailedMatches = await this.processMatchesInBatches(liveMatches)

      return detailedMatches
    } catch (error) {
      this.logger.error(`❌ Error trayendo partidos LIVE: ${error.message}`)
      return []
    }
  }

  private async fetchLiveMatches(): Promise<any[]> {
    const cacheKey = 'live-matches'
    const cachedData = this.cacheService.get<any[]>(cacheKey)

    if (cachedData) {
      return cachedData
    }

    const response = await this.makeRequestWithRetry(() =>
      this.api.get('/tournaments/get-live-events', {
        params: { sport: 'football' },
      })
    )

    const liveMatches = response.data.events || []

    this.cacheService.set(cacheKey, liveMatches, 30)

    return liveMatches
  }

  private async processMatchesInBatches(
    matches: any[]
  ): Promise<LiveMatchOutputDto[]> {
    const allDetailedMatches: LiveMatchOutputDto[] = []

    for (let i = 0; i < matches.length; i += this.requestConcurrency) {
      const batch = matches.slice(i, i + this.requestConcurrency)
      const batchPromises = batch.map((match) => this.processMatch(match))

      const batchResults = await Promise.all(batchPromises)
      allDetailedMatches.push(...batchResults)

      if (i + this.requestConcurrency < matches.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return allDetailedMatches
  }

  private async processMatch(match: any): Promise<LiveMatchOutputDto> {
    const fixtureId = match.id
    const homeTeam = match.homeTeam.name
    const awayTeam = match.awayTeam.name
    const minute = this.calculateMinute(match)
    const scoreHome = match.homeScore.current
    const scoreAway = match.awayScore.current

    const [stats, timeline] = await Promise.all([
      this.fetchMatchStatistics(fixtureId, homeTeam, awayTeam),
      this.fetchMatchTimeline(fixtureId, homeTeam, awayTeam),
    ])

    const {
      totalShots,
      shotsOnTarget,
      dangerousAttacks,
      cornersHome,
      cornersAway,
    } = stats

    const basePressureScore = this.calculatePressureScore({
      totalShots,
      shotsOnTarget,
      dangerousAttacks,
      corners: cornersHome + cornersAway,
    })

    const recentEvents = timeline.filter((event) => event.minute >= minute - 8)
    const recentActivityScore = this.calculateRecentActivityScore(recentEvents)
    const finalPressureScore = basePressureScore + recentActivityScore

    const lastEventType =
      timeline.sort((a, b) => b.minute - a.minute)[0]?.type || null

    const isGoodForOver05 = finalPressureScore >= 6.5
    const isGoodForOver15 = finalPressureScore >= 8.0

    const state = this.determineMatchState({
      minute,
      scoreHome,
      scoreAway,
      pressureScore: finalPressureScore,
      isGoodForOver05,
      isGoodForOver15,
    })

    return {
      id: fixtureId,
      homeTeam,
      awayTeam,
      minute,
      scoreHome,
      scoreAway,
      shots: totalShots,
      shotsOnTarget,
      dangerousAttacks,
      corners: cornersHome + cornersAway,
      pressureScore: finalPressureScore,
      hasRecentActivity: recentEvents.length > 0,
      marketAvailable: true,
      lastEventType,
      bookmakers: null,
      timeline,
      isGoodForOver05,
      isGoodForOver15,
      state,
    } as LiveMatchOutputDto
  }

  private determineMatchState(params: {
    minute: number
    scoreHome: number
    scoreAway: number
    pressureScore: number
    isGoodForOver05: boolean
    isGoodForOver15: boolean
    lastPeriod?: string
  }): MatchState {
    const {
      minute,
      scoreHome,
      scoreAway,
      pressureScore,
      isGoodForOver05,
      isGoodForOver15,
      lastPeriod,
    } = params

    if (lastPeriod === 'half_time') {
      return MatchState.HalfTime // 👈 Detectamos Medio Tiempo real
    }

    if (minute === 0) {
      return MatchState.NotStarted
    }

    if (minute >= 90) {
      return MatchState.Finished
    }

    if (lastPeriod === 'period1') {
      return MatchState.FirstHalf
    }

    if (lastPeriod === 'period2') {
      return MatchState.SecondHalf
    }

    if (scoreHome + scoreAway >= 4) {
      return MatchState.NoBet
    }

    if (!isGoodForOver05 && !isGoodForOver15) {
      return MatchState.Normal
    }

    if (isGoodForOver15) {
      return MatchState.ReadyToBet
    }

    if (isGoodForOver05) {
      return MatchState.Potential
    }

    return MatchState.Normal
  }

  private async fetchMatchStatistics(
    fixtureId: number,
    homeTeam: string,
    awayTeam: string
  ): Promise<{
    totalShots: number
    shotsOnTarget: number
    dangerousAttacks: number
    cornersHome: number
    cornersAway: number
  }> {
    const cacheKey = `stats-${fixtureId}`
    const cachedStats = this.cacheService.get<{
      totalShots: number
      shotsOnTarget: number
      dangerousAttacks: number
      cornersHome: number
      cornersAway: number
    }>(cacheKey)

    if (cachedStats) {
      return cachedStats
    }

    try {
      const statsResponse = await this.makeRequestWithRetry(() =>
        this.api.get('/matches/get-statistics', {
          params: { matchId: fixtureId },
        })
      )

      const statsData = statsResponse.data
      const statsSnapshot = this.takeStatisticsSnapshot(statsData)

      this.cacheService.set(cacheKey, statsSnapshot, 15)

      return statsSnapshot
    } catch (error) {
      this.logger.warn(
        `⚠️ No se pudo cargar estadísticas para ${homeTeam} vs ${awayTeam}: ${error.message}`
      )
      return {
        totalShots: 0,
        shotsOnTarget: 0,
        dangerousAttacks: 0,
        cornersHome: 0,
        cornersAway: 0,
      }
    }
  }

  private async fetchMatchTimeline(
    fixtureId: number,
    homeTeam: string,
    awayTeam: string
  ): Promise<TimelineEventDto[]> {
    const cacheKey = `timeline-${fixtureId}`
    const cachedTimeline = this.cacheService.get<TimelineEventDto[]>(cacheKey)

    if (cachedTimeline) {
      return cachedTimeline
    }

    try {
      const incidentsResponse = await this.makeRequestWithRetry(() =>
        this.api.get('/matches/get-incidents', {
          params: { matchId: fixtureId },
        })
      )

      const incidentsData = incidentsResponse.data
      const timeline = this.buildTimeline(
        incidentsData.incidents,
        homeTeam,
        awayTeam
      )

      this.cacheService.set(cacheKey, timeline, 15)

      return timeline
    } catch (error) {
      this.logger.warn(
        `⚠️ No se pudo cargar eventos para ${homeTeam} vs ${awayTeam}: ${error.message}`
      )
      return []
    }
  }

  private async makeRequestWithRetry<T>(
    requestFn: () => Promise<T>,
    attempts = this.retryAttempts
  ): Promise<T> {
    try {
      return await requestFn()
    } catch (error) {
      if (attempts <= 1) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, this.retryDelay))
      return this.makeRequestWithRetry(requestFn, attempts - 1)
    }
  }

  private calculateMinute(match: any): number {
    const now = Math.floor(Date.now() / 1000)
    const startTimestamp = match.startTimestamp
    const currentPeriodStart = match.time?.currentPeriodStartTimestamp
    const lastPeriod = match.lastPeriod

    if (!startTimestamp || !currentPeriodStart) {
      return 0
    }

    const elapsedSeconds = now - currentPeriodStart
    const elapsedMinutes = Math.floor(elapsedSeconds / 60)

    if (lastPeriod === 'period2') {
      return 45 + Math.max(elapsedMinutes, 0)
    }

    if (lastPeriod === 'period1') {
      return Math.max(elapsedMinutes, 0)
    }

    if (lastPeriod === 'extra1') {
      return 90 + Math.max(elapsedMinutes, 0)
    }

    if (lastPeriod === 'extra2') {
      return 105 + Math.max(elapsedMinutes, 0)
    }

    if (lastPeriod === 'penalties') {
      return 120
    }

    return Math.max(elapsedMinutes, 0)
  }

  private takeStatisticsSnapshot(statisticsData: any): {
    totalShots: number
    shotsOnTarget: number
    dangerousAttacks: number
    cornersHome: number
    cornersAway: number
  } {
    let totalShots = 0
    let shotsOnTarget = 0
    let dangerousAttacks = 0
    let cornersHome = 0
    let cornersAway = 0

    const allStatistics = statisticsData.statistics || []

    for (const period of allStatistics) {
      const groups = period.groups || []

      for (const group of groups) {
        const items = group.statisticsItems || []

        for (const stat of items) {
          if (stat.name === 'Total shots') {
            totalShots += (stat.homeValue ?? 0) + (stat.awayValue ?? 0)
          }
          if (stat.name === 'Shots on target') {
            shotsOnTarget += (stat.homeValue ?? 0) + (stat.awayValue ?? 0)
          }
          if (stat.name === 'Corner kicks') {
            cornersHome += stat.homeValue ?? 0
            cornersAway += stat.awayValue ?? 0
          }
          if (stat.name === 'Dangerous attacks') {
            dangerousAttacks += (stat.homeValue ?? 0) + (stat.awayValue ?? 0)
          }
        }
      }
    }

    return {
      totalShots,
      shotsOnTarget,
      dangerousAttacks,
      cornersHome,
      cornersAway,
    }
  }

  private buildTimeline(
    incidents: any[],
    homeTeamName: string,
    awayTeamName: string
  ): TimelineEventDto[] {
    const timeline: TimelineEventDto[] = []

    if (!incidents || !Array.isArray(incidents)) return timeline

    for (const incident of incidents) {
      if (
        ['goal', 'card', 'substitution', 'injury', 'var'].includes(
          incident.incidentType
        )
      ) {
        timeline.push({
          type: this.mapIncidentType(incident.incidentType),
          detail: incident.reason || incident.incidentType,
          team: incident.isHome ? homeTeamName : awayTeamName,
          player: incident.player?.name ?? '',
          assist: incident.assist1?.name ?? null,
          minute: incident.time,
        })
      }
    }

    return timeline.sort((a, b) => a.minute - b.minute)
  }

  private mapIncidentType(incidentType: string): string {
    const typeMap = {
      goal: 'Goal',
      card: 'Card',
      substitution: 'Substitution',
      injury: 'Injury',
      var: 'VAR',
    }

    return typeMap[incidentType] || 'Other'
  }

  private calculatePressureScore({
    totalShots,
    shotsOnTarget,
    dangerousAttacks,
    corners,
  }: {
    totalShots: number
    shotsOnTarget: number
    dangerousAttacks: number
    corners: number
  }): number {
    let score = 0
    if (totalShots >= 10) score += 2
    if (shotsOnTarget >= 5) score += 2
    if (dangerousAttacks >= 80) score += 3
    if (corners >= 4) score += 1
    return score
  }

  private calculateRecentActivityScore(events: TimelineEventDto[]): number {
    let score = 0
    for (const event of events) {
      if (event.type === 'Corner') score += 2
      if (event.type === 'Shot') score += 1
      if (event.type === 'Shot on Target') score += 2
      if (event.type === 'Dangerous Attack') score += 1
      if (event.type === 'Goal') score += 3
      if (event.type === 'Card') score += 0.5
    }
    return score
  }
}
