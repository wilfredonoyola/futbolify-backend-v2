import { Injectable } from '@nestjs/common'
import { LiveMatchOutputDto, TimelineEventDto } from './dto'
import axios from 'axios'

@Injectable()
export class SportmonksService {
  private readonly apiToken = process.env.SPORTMONKS_API_KEY
  private readonly api = axios.create({
    baseURL: 'https://api.sportmonks.com/v3/football',
    params: { api_token: this.apiToken },
  })

  private matchSnapshots = new Map<
    number,
    {
      totalShots: number
      shotsOnTarget: number
      dangerousAttacks: number
      corners: number
    }
  >()

  async getLiveMatchesDetailedFromSportmonks(): Promise<LiveMatchOutputDto[]> {
    try {
      const liveResponse = await this.api.get('/livescores/inplay', {
        params: {
          include: 'events;statistics',
        },
      })

      const fixtures = liveResponse.data.data

      if (!fixtures.length) {
        console.log('❌ No hay partidos LIVE en SportMonks.')
        return []
      }

      console.log(`✅ ${fixtures.length} partidos en vivo (SportMonks).`)

      const matches = fixtures.map((fixture) => {
        try {
          const fixtureId = fixture.id
          const homeTeam =
            fixture.participants.find((p) => p.meta.location === 'home')
              ?.name ?? 'Home'
          const awayTeam =
            fixture.participants.find((p) => p.meta.location === 'away')
              ?.name ?? 'Away'
          const minute = fixture.time.minute ?? 0
          const scoreHome =
            fixture.scores.find((s) => s.description === 'CURRENT')
              ?.home_score ?? 0
          const scoreAway =
            fixture.scores.find((s) => s.description === 'CURRENT')
              ?.away_score ?? 0

          const stats = fixture.statistics ?? []
          const events = fixture.events ?? []

          const currentStatsSnapshot = this.takeStatisticsSnapshot(stats)
          const previousStatsSnapshot = this.matchSnapshots.get(fixtureId) || {
            totalShots: 0,
            shotsOnTarget: 0,
            dangerousAttacks: 0,
            corners: 0,
          }

          this.matchSnapshots.set(fixtureId, currentStatsSnapshot)

          const realTimeline: TimelineEventDto[] = events.map((event) => ({
            type: event.type.name,
            detail: event.description ?? event.type.name,
            team: event.participant?.name ?? 'Unknown',
            player: event.player_name ?? null,
            assist: event.assist_name ?? null,
            minute: event.time.minute ?? 0,
          }))

          const fullTimeline = realTimeline.sort((a, b) => a.minute - b.minute)

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
            marketAvailable: true, // asumir mercado activo si datos están disponibles
            lastEventType,
            bookmakers: null,
            timeline: fullTimeline,
          } as LiveMatchOutputDto
        } catch (fixtureError) {
          console.error(
            `❌ Error procesando fixture ID ${fixture.id}:`,
            fixtureError.message
          )
          return null
        }
      })

      return matches.filter((match) => match !== null)
    } catch (error) {
      console.error('❌ Error general en SportMonks API:', error.message)
      throw new Error('Error obteniendo partidos en vivo desde SportMonks')
    }
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

    for (const stat of stats) {
      const type = stat.type.name
      const value = stat.data.value
      if (type === 'Shots total' && value !== null) totalShots += value
      if (type === 'Shots on target' && value !== null) shotsOnTarget += value
      if (type === 'Dangerous attacks' && value !== null)
        dangerousAttacks += value
      if (type === 'Corner kicks' && value !== null) corners += value
    }

    return { totalShots, shotsOnTarget, dangerousAttacks, corners }
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
}
