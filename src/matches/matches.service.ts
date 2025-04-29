import { Injectable } from '@nestjs/common'
import {
  LiveMatchOutputDto,
  MatchAnalysisOutputDto,
  TimelineEventDto,
} from './dto'
import axios from 'axios'

@Injectable()
export class MatchesService {
  private readonly apiKey = process.env.API_SPORTS_KEY
  private readonly api = axios.create({
    baseURL: 'https://v3.football.api-sports.io',
    headers: {
      'x-apisports-key': this.apiKey,
    },
  })

  // 🧠 Nuevo: Snapshots previos por fixtureId
  private matchSnapshots = new Map<
    number,
    {
      totalShots: number
      shotsOnTarget: number
      dangerousAttacks: number
      corners: number
    }
  >()

  async getLiveMatchesDetailed(): Promise<LiveMatchOutputDto[]> {
    const liveFixturesResponse = await this.api.get('/fixtures', {
      params: { live: 'all' },
    })
    const fixtures = liveFixturesResponse.data.response

    if (!fixtures.length) {
      console.log('❌ No hay partidos LIVE en este momento.')
      return []
    }

    console.log(`✅ ${fixtures.length} partidos en vivo.`)

    const matches = await Promise.all(
      fixtures.map(async (fixture) => {
        const fixtureId = fixture.fixture.id
        const homeTeam = fixture.teams.home.name
        const awayTeam = fixture.teams.away.name
        const minute = fixture.fixture.status.elapsed
        const scoreHome = fixture.goals.home
        const scoreAway = fixture.goals.away

        try {
          const [statsResponse, eventsResponse, oddsResponse] =
            await Promise.all([
              this.api.get('/fixtures/statistics', {
                params: { fixture: fixtureId },
              }),
              this.api.get('/fixtures/events', {
                params: { fixture: fixtureId },
              }),
              this.api.get('/odds', { params: { fixture: fixtureId } }),
            ])

          const stats = statsResponse.data.response
          const events = eventsResponse.data.response
          const odds = oddsResponse.data.response

          // 📦 Snapshot actual
          const currentStatsSnapshot = this.takeStatisticsSnapshot(stats)

          // 📦 Snapshot previo
          const previousStatsSnapshot = this.matchSnapshots.get(fixtureId) || {
            totalShots: 0,
            shotsOnTarget: 0,
            dangerousAttacks: 0,
            corners: 0,
          }

          // 🔎 Infiere eventos basados en comparación de stats
          const inferredTimeline: TimelineEventDto[] = this.compareSnapshots(
            previousStatsSnapshot,
            currentStatsSnapshot,
            minute
          )

          // 🎯 Actualiza el snapshot guardado
          this.matchSnapshots.set(fixtureId, currentStatsSnapshot)

          // 🎯 Timeline real basado en eventos oficiales
          const realTimeline: TimelineEventDto[] = events.map((event) => ({
            type: event.type,
            detail: event.detail,
            team: event.team.name,
            player: event.player?.name ?? null,
            assist: event.assist?.name ?? null,
            minute: event.time.elapsed,
          }))

          // 🎯 Unimos timelines
          const fullTimeline = [...realTimeline, ...inferredTimeline].sort(
            (a, b) => a.minute - b.minute
          )

          const totalShots = currentStatsSnapshot.totalShots
          const shotsOnTarget = currentStatsSnapshot.shotsOnTarget
          const dangerousAttacks = currentStatsSnapshot.dangerousAttacks
          const corners = currentStatsSnapshot.corners

          const basePressureScore = this.calculatePressureScore({
            totalShots,
            shotsOnTarget,
            dangerousAttacks,
            corners,
          })

          const recentEvents = fullTimeline.filter(
            (event) =>
              event.minute >= minute - 8 &&
              [
                'Goal',
                'Corner',
                'Shot',
                'Shot on Target',
                'Dangerous Attack',
              ].includes(event.type)
          )

          const recentActivityScore =
            this.calculateRecentActivityScore(recentEvents)
          const finalPressureScore = basePressureScore + recentActivityScore

          const lastEventType =
            fullTimeline.sort((a, b) => b.minute - a.minute)[0]?.type ?? null

          const bookmakersNames: string[] =
            odds?.[0]?.bookmakers?.map((bk) => bk.name) || []

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
            corners,
            pressureScore: finalPressureScore,
            hasRecentActivity: recentEvents.length > 0,
            marketAvailable: bookmakersNames.length > 0,
            lastEventType: lastEventType,
            bookmakers: bookmakersNames.length > 0 ? bookmakersNames : null,
            timeline: fullTimeline,
          } as LiveMatchOutputDto
        } catch (error) {
          console.error(
            `❌ Error analizando partido ${homeTeam} vs ${awayTeam}: ${error.message}`
          )
          return null
        }
      })
    )

    return matches.filter((match) => match !== null)
  }

  private takeStatisticsSnapshot(stats: any[]): {
    totalShots: number
    shotsOnTarget: number
    dangerousAttacks: number
    corners: number
  } {
    let totalShots = 0
    let shotsOnTarget = 0
    let dangerousAttacks = 0
    let corners = 0

    for (const teamStats of stats) {
      for (const stat of teamStats.statistics) {
        if (stat.type === 'Total Shots' && stat.value !== null)
          totalShots += stat.value
        if (stat.type === 'Shots on Goal' && stat.value !== null)
          shotsOnTarget += stat.value
        if (stat.type === 'Dangerous Attacks' && stat.value !== null)
          dangerousAttacks += stat.value
        if (stat.type === 'Corner Kicks' && stat.value !== null)
          corners += stat.value
      }
    }

    return { totalShots, shotsOnTarget, dangerousAttacks, corners }
  }

  private compareSnapshots(
    prev: {
      totalShots: number
      shotsOnTarget: number
      dangerousAttacks: number
      corners: number
    },
    curr: {
      totalShots: number
      shotsOnTarget: number
      dangerousAttacks: number
      corners: number
    },
    minute: number
  ): TimelineEventDto[] {
    const inferredEvents: TimelineEventDto[] = []

    if (curr.corners > prev.corners) {
      for (let i = 0; i < curr.corners - prev.corners; i++) {
        inferredEvents.push({
          type: 'Corner',
          detail: 'Inferred Corner',
          team: 'Unknown',
          player: null,
          assist: null,
          minute,
        })
      }
    }

    if (curr.totalShots > prev.totalShots) {
      for (let i = 0; i < curr.totalShots - prev.totalShots; i++) {
        inferredEvents.push({
          type: 'Shot',
          detail: 'Inferred Shot',
          team: 'Unknown',
          player: null,
          assist: null,
          minute,
        })
      }
    }

    if (curr.shotsOnTarget > prev.shotsOnTarget) {
      for (let i = 0; i < curr.shotsOnTarget - prev.shotsOnTarget; i++) {
        inferredEvents.push({
          type: 'Shot on Target',
          detail: 'Inferred Shot on Target',
          team: 'Unknown',
          player: null,
          assist: null,
          minute,
        })
      }
    }

    if (curr.dangerousAttacks > prev.dangerousAttacks) {
      for (let i = 0; i < curr.dangerousAttacks - prev.dangerousAttacks; i++) {
        inferredEvents.push({
          type: 'Dangerous Attack',
          detail: 'Inferred Dangerous Attack',
          team: 'Unknown',
          player: null,
          assist: null,
          minute,
        })
      }
    }

    return inferredEvents
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
    }
    return score
  }

  async analyzeSingleMatch(fixtureId: number): Promise<MatchAnalysisOutputDto> {
    try {
      const fixtureResponse = await this.api.get('/fixtures', {
        params: { id: fixtureId },
      })
      const fixture = fixtureResponse.data.response[0]

      if (!fixture) {
        throw new Error('Fixture no encontrado')
      }

      const statsResponse = await this.api.get('/fixtures/statistics', {
        params: { fixture: fixtureId },
      })

      const eventsResponse = await this.api.get('/fixtures/events', {
        params: { fixture: fixtureId },
      })

      const oddsResponse = await this.api.get('/odds', {
        params: { fixture: fixtureId },
      })

      const stats = statsResponse.data.response
      const events = eventsResponse.data.response
      const odds = oddsResponse.data.response

      const homeTeam = fixture.teams.home.name
      const awayTeam = fixture.teams.away.name
      const minute = fixture.fixture.status.elapsed
      const scoreHome = fixture.goals.home
      const scoreAway = fixture.goals.away

      let totalShots = 0
      let shotsOnTarget = 0
      let dangerousAttacks = 0
      let corners = 0

      for (const teamStats of stats) {
        for (const stat of teamStats.statistics) {
          if (stat.type === 'Total Shots' && stat.value !== null)
            totalShots += stat.value
          if (stat.type === 'Shots on Goal' && stat.value !== null)
            shotsOnTarget += stat.value
          if (stat.type === 'Dangerous Attacks' && stat.value !== null)
            dangerousAttacks += stat.value
          if (stat.type === 'Corner Kicks' && stat.value !== null)
            corners += stat.value
        }
      }

      const recentEvents = events.filter(
        (event) =>
          event.time.elapsed >= minute - 8 &&
          ['Shot on Goal', 'Corner', 'Goal', 'Yellow Card'].includes(event.type)
      )

      const basePressureScore = this.calculatePressureScore({
        totalShots,
        shotsOnTarget,
        dangerousAttacks,
        corners,
      })

      const recentActivityScore =
        this.calculateRecentActivityScore(recentEvents)

      const finalPressureScore = basePressureScore + recentActivityScore

      const sortedEvents = events.sort(
        (a, b) => b.time.elapsed - a.time.elapsed
      )
      const lastEventType = sortedEvents[0]?.type || null

      const bookmakersNames: string[] =
        odds?.[0]?.bookmakers?.map((bk) => bk.name) || []
      const marketAvailable = bookmakersNames.length > 0

      const redFlagsDetected = this.checkRedFlags({
        totalShots,
        shotsOnTarget,
        dangerousAttacks,
        corners,
      })

      const recommendation = this.decideBetRecommendation({
        pressureScore: finalPressureScore,
        marketAvailable,
        minute,
        redFlagsDetected,
      })

      // Ahora armamos las razones de por qué sí o no apostar
      let reasonToBet = null
      let reasonNotToBet = null

      if (recommendation === 'No apostar') {
        if (!marketAvailable) {
          reasonNotToBet = 'No hay mercado disponible en vivo.'
        } else if (redFlagsDetected) {
          reasonNotToBet =
            'Se detectaron red flags: baja precisión de remates o dominio estéril.'
        } else if (minute < 55) {
          reasonNotToBet = 'El partido aún no ha alcanzado el minuto 55.'
        } else if (finalPressureScore < 6.5) {
          reasonNotToBet =
            'La presión ofensiva es insuficiente para recomendar una apuesta.'
        } else {
          reasonNotToBet =
            'Condiciones no ideales para apostar en este momento.'
        }
      } else {
        if (recommendation === 'Over 0.5 Goles') {
          reasonToBet =
            'Presión ofensiva moderada-alta detectada y actividad reciente favorable.'
        } else if (recommendation === 'Over 1.5 Goles') {
          reasonToBet =
            'Presión ofensiva extremadamente alta detectada; alta probabilidad de más goles.'
        }
      }

      return {
        fixtureId,
        homeTeam,
        awayTeam,
        minute,
        scoreHome,
        scoreAway,
        pressureScore: finalPressureScore,
        recommendation,
        redFlagsDetected,
        marketAvailable,
        lastEventType,
        reasonToBet,
        reasonNotToBet,
      }
    } catch (error) {
      console.error(
        `❌ Error analizando fixture ${fixtureId}: ${error.message}`
      )
      throw new Error('Error analizando el partido')
    }
  }

  private checkRedFlags({
    totalShots,
    shotsOnTarget,
    dangerousAttacks,
    corners,
  }: {
    totalShots: number
    shotsOnTarget: number
    dangerousAttacks: number
    corners: number
  }): boolean {
    const shotsAccuracy = shotsOnTarget / (totalShots || 1)
    if (shotsAccuracy < 0.25) return true
    if (dangerousAttacks < 70 && totalShots > 10) return true
    return false
  }

  private decideBetRecommendation({
    pressureScore,
    marketAvailable,
    minute,
    redFlagsDetected,
  }: {
    pressureScore: number
    marketAvailable: boolean
    minute: number
    redFlagsDetected: boolean
  }): string {
    if (!marketAvailable || redFlagsDetected || minute < 55) {
      return 'No apostar'
    }

    if (pressureScore >= 8.0) {
      return 'Over 1.5 Goles'
    } else if (pressureScore >= 6.5) {
      return 'Over 0.5 Goles'
    } else {
      return 'No apostar'
    }
  }
}
