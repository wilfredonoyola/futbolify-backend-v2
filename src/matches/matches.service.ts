import { Injectable } from '@nestjs/common'
import { LiveMatchOutputDto } from './dto'
import axios from 'axios'

@Injectable()
export class MatchesService {
  private readonly apiKey = 'e4d595a2f938020b9c1cfd348b05efd7' // ⚠️ Mover luego a .env seguro

  private readonly api = axios.create({
    baseURL: 'https://v3.football.api-sports.io',
    headers: {
      'x-apisports-key': this.apiKey,
    },
  })

  /**
   * 🚀 Método SIMPLE:
   * Devuelve lista plana de partidos vivos (sin estadísticas, sin odds)
   */
  async getLiveMatchesSimple(): Promise<LiveMatchOutputDto[]> {
    const liveFixturesResponse = await this.api.get('/fixtures', {
      params: { live: 'all' },
    })

    const fixtures = liveFixturesResponse.data.response

    if (!fixtures.length) {
      console.log('❌ No hay partidos LIVE en este momento.')
      return []
    }

    console.log(`✅ Se encontraron ${fixtures.length} partidos en vivo.`)

    const matches = fixtures.map((fixture) => ({
      id: fixture.fixture.id,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      minute: fixture.fixture.status.elapsed,
      scoreHome: fixture.goals.home,
      scoreAway: fixture.goals.away,
    })) as LiveMatchOutputDto[]

    console.log(`🎯 Partidos planos listos: ${matches.length}`)

    return matches
  }

  /**
   * 🚀 Método DETALLADO:
   * Devuelve lista completa con estadísticas y odds
   */
  async getLiveMatchesDetailed(): Promise<LiveMatchOutputDto[]> {
    const liveFixturesResponse = await this.api.get('/fixtures', {
      params: { live: 'all' },
    })

    const fixtures = liveFixturesResponse.data.response

    if (!fixtures.length) {
      console.log('❌ No hay partidos LIVE en este momento.')
      return []
    }

    console.log(`✅ Se encontraron ${fixtures.length} partidos en vivo.`)

    const matches = await Promise.all(
      fixtures.map(async (fixture) => {
        const fixtureId = fixture.fixture.id
        const homeTeam = fixture.teams.home.name
        const awayTeam = fixture.teams.away.name
        const minute = fixture.fixture.status.elapsed
        const scoreHome = fixture.goals.home
        const scoreAway = fixture.goals.away

        console.log(
          `➡️ Analizando partido: ${homeTeam} vs ${awayTeam} (ID: ${fixtureId})`
        )

        try {
          // 🚀 Traer estadísticas
          const statsResponse = await this.api.get('/fixtures/statistics', {
            params: { fixture: fixtureId },
          })

          const stats = statsResponse.data.response

          let totalShots = 0
          let shotsOnTarget = 0
          let dangerousAttacks = 0
          let corners = 0

          for (const teamStats of stats) {
            for (const stat of teamStats.statistics) {
              if (stat.type === 'Total Shots' && stat.value !== null) {
                totalShots += stat.value
              }
              if (stat.type === 'Shots on Goal' && stat.value !== null) {
                shotsOnTarget += stat.value
              }
              if (stat.type === 'Dangerous Attacks' && stat.value !== null) {
                dangerousAttacks += stat.value
              }
              if (stat.type === 'Corner Kicks' && stat.value !== null) {
                corners += stat.value
              }
            }
          }

          console.log(
            `📊 Stats: Shots=${totalShots}, OnTarget=${shotsOnTarget}, Dangerous=${dangerousAttacks}, Corners=${corners}`
          )

          // 🚀 Traer odds
          const oddsResponse = await this.api.get('/odds', {
            params: { fixture: fixtureId },
          })

          const oddsData = oddsResponse.data.response[0]
          const bookmakersNames: string[] =
            oddsData?.bookmakers?.map((bk) => bk.name) || []

          console.log(
            `🏦 Casas disponibles: ${
              bookmakersNames.length
                ? bookmakersNames.join(', ')
                : 'Ninguna encontrada'
            }`
          )

          let initialOddsHome: string | undefined
          let initialOddsAway: string | undefined
          let nextGoalOddsHome: string | undefined
          let nextGoalOddsAway: string | undefined

          if (oddsData?.bookmakers?.length) {
            const allBets = oddsData.bookmakers.flatMap((bk) => bk.bets)

            // Buscar "Match Winner" ➔ Cuotas iniciales
            const matchWinner = allBets.find(
              (bet) => bet.name === 'Match Winner'
            )
            if (matchWinner) {
              const homeOdd = matchWinner.values.find((v) => v.value === 'Home')
              const awayOdd = matchWinner.values.find((v) => v.value === 'Away')
              initialOddsHome = homeOdd?.odd || undefined
              initialOddsAway = awayOdd?.odd || undefined
            }

            // Buscar "Next Goal" ➔ Cuotas próximo gol
            const nextGoal = allBets.find((bet) =>
              bet.name.includes('Next Goal')
            )
            if (nextGoal) {
              const homeNextGoal = nextGoal.values.find(
                (v) => v.value === 'Home'
              )
              const awayNextGoal = nextGoal.values.find(
                (v) => v.value === 'Away'
              )
              nextGoalOddsHome = homeNextGoal?.odd || undefined
              nextGoalOddsAway = awayNextGoal?.odd || undefined
            }
          }

          // 🚀 FILTRO: Solo agregar si hay stats
          if (
            totalShots === 0 &&
            shotsOnTarget === 0 &&
            dangerousAttacks === 0 &&
            corners === 0
          ) {
            console.log(
              '⚠️ Partido descartado por falta de estadísticas suficientes.'
            )
            return null
          }

          console.log('✅ Partido válido para análisis.')

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
            corners: corners,
            bookmakers: bookmakersNames,
            initialOddsHome,
            initialOddsAway,
            nextGoalOddsHome,
            nextGoalOddsAway,
            liveOddsHome: undefined,
            liveOddsAway: undefined,
          } as LiveMatchOutputDto
        } catch (error) {
          console.error(
            `❌ Error en partido ${homeTeam} vs ${awayTeam}: ${error.message}`
          )
          return null
        }
      })
    )

    const validMatches = matches.filter((match) => match !== null)

    console.log(
      `🎯 Total partidos listos para análisis: ${validMatches.length}`
    )

    return validMatches
  }
}
