import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { LiveMatchOutputDto } from './dto'

@Injectable()
export class LiveMatchesFetcherService {
  private readonly apiKey = 'e4d595a2f938020b9c1cfd348b05efd7' // ⚠️ Ponla en .env luego

  async fetchLiveMatches(): Promise<LiveMatchOutputDto[]> {
    const response = await axios.get(
      'https://v3.football.api-sports.io/fixtures?live=all',
      {
        headers: {
          'x-apisports-key': this.apiKey,
        },
      }
    )

    const matches = response.data.response

    return matches.map((match) => ({
      id: match.fixture.id,
      homeTeam: match.teams.home.name,
      awayTeam: match.teams.away.name,
      minute: match.fixture.status.elapsed,
      scoreHome: match.goals.home,
      scoreAway: match.goals.away,
      shots: match.statistics?.[0]?.shots?.total ?? 0,
      shotsOnTarget: match.statistics?.[0]?.shots?.on ?? 0,
      dangerousAttacks: match.statistics?.[0]?.attacks?.dangerous ?? 0,
      corners: match.statistics?.[0]?.corners?.total ?? 0,
    }))
  }
}
