import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoalGuruMatchDto } from './dto'

/**
 * League IDs mapping for API-Football
 */
const LEAGUE_IDS: Record<string, { id: number; name: string; season: number }> = {
  'premier-league': { id: 39, name: 'Premier League', season: 2024 },
  'la-liga': { id: 140, name: 'La Liga', season: 2024 },
  'serie-a': { id: 135, name: 'Serie A', season: 2024 },
  'bundesliga': { id: 78, name: 'Bundesliga', season: 2024 },
  'ligue-1': { id: 61, name: 'Ligue 1', season: 2024 },
  'liga-mx': { id: 262, name: 'Liga MX', season: 2024 },
  'champions': { id: 2, name: 'UEFA Champions League', season: 2024 },
  'libertadores': { id: 13, name: 'Copa Libertadores', season: 2025 },
}

@Injectable()
export class ApiFootballService {
  private readonly logger = new Logger(ApiFootballService.name)
  private readonly apiKey: string
  private readonly baseUrl = 'https://v3.football.api-sports.io'
  private readonly retryAttempts = 2
  private readonly retryDelay = 1000

  // Cache for fixtures (30 minutes)
  private readonly fixturesCache = new Map<
    string,
    { data: GoalGuruMatchDto[]; expiresAt: number }
  >()
  private readonly CACHE_TTL_MS = 30 * 60 * 1000

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('API_FOOTBALL_KEY')
  }

  async getUpcomingFixtures(leagueId: string): Promise<GoalGuruMatchDto[]> {
    // Check cache
    const cacheKey = leagueId
    const cached = this.fixturesCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(`Cache hit for league ${leagueId}`)
      return cached.data
    }

    if (!this.apiKey) {
      this.logger.warn('No API_FOOTBALL_KEY configured, returning empty')
      return []
    }

    const leagueInfo = LEAGUE_IDS[leagueId]
    if (!leagueInfo) {
      this.logger.warn(`Unknown league ID: ${leagueId}`)
      return []
    }

    try {
      const fixtures = await this.fetchFixturesWithRetry(
        leagueInfo.id,
        leagueInfo.season,
        leagueInfo.name
      )

      // Cache result
      this.fixturesCache.set(cacheKey, {
        data: fixtures,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      })

      this.logger.log(
        `✅ Fetched ${fixtures.length} fixtures for ${leagueInfo.name}`
      )
      return fixtures
    } catch (error) {
      this.logger.error(
        `Error fetching fixtures for ${leagueId}: ${error.message}`
      )
      return []
    }
  }

  private async fetchFixturesWithRetry(
    leagueId: number,
    season: number,
    leagueName: string,
    attempt = 1
  ): Promise<GoalGuruMatchDto[]> {
    try {
      const today = new Date()
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

      // Format dates as YYYY-MM-DD
      const from = today.toISOString().split('T')[0]
      const to = nextWeek.toISOString().split('T')[0]

      const response = await fetch(
        `${this.baseUrl}/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}`,
        {
          headers: {
            'x-apisports-key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const fixtures = data.response || []

      // Parse fixtures into GoalGuruMatchDto format
      return fixtures.slice(0, 8).map((fixture: any) => {
        const matchDate = new Date(fixture.fixture.date)
        return {
          home: fixture.teams.home.name,
          away: fixture.teams.away.name,
          date: matchDate.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
          }),
          time: matchDate.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          comp: leagueName,
        }
      })
    } catch (error) {
      this.logger.error(
        `Fetch fixtures attempt ${attempt} failed: ${error.message}`
      )

      if (attempt < this.retryAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * attempt)
        )
        return this.fetchFixturesWithRetry(
          leagueId,
          season,
          leagueName,
          attempt + 1
        )
      }

      throw error
    }
  }

  /**
   * Get team statistics for current season
   */
  async getTeamStats(teamId: number, leagueId: number, season: number): Promise<any> {
    if (!this.apiKey) {
      this.logger.warn('No API_FOOTBALL_KEY configured')
      return null
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
        {
          headers: {
            'x-apisports-key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const stats = data.response

      if (!stats) return null

      return {
        form: stats.form || 'N/A',
        goalsFor: stats.goals?.for?.total?.total || 0,
        goalsAgainst: stats.goals?.against?.total?.total || 0,
        avgGoalsScored: parseFloat((stats.goals?.for?.average?.total || 0).toFixed(2)),
        avgGoalsConceded: parseFloat((stats.goals?.against?.average?.total || 0).toFixed(2)),
        cleanSheets: stats.clean_sheet?.total || 0,
        failedToScore: stats.failed_to_score?.total || 0,
        wins: stats.fixtures?.wins?.total || 0,
        draws: stats.fixtures?.draws?.total || 0,
        losses: stats.fixtures?.losses?.total || 0,
        homeRecord: {
          wins: stats.fixtures?.wins?.home || 0,
          draws: stats.fixtures?.draws?.home || 0,
          losses: stats.fixtures?.losses?.home || 0,
        },
        awayRecord: {
          wins: stats.fixtures?.wins?.away || 0,
          draws: stats.fixtures?.draws?.away || 0,
          losses: stats.fixtures?.losses?.away || 0,
        },
      }
    } catch (error) {
      this.logger.error(`Error fetching team stats: ${error.message}`)
      return null
    }
  }

  /**
   * Get head-to-head history between two teams
   */
  async getH2H(team1Id: number, team2Id: number, last = 10): Promise<any> {
    if (!this.apiKey) {
      this.logger.warn('No API_FOOTBALL_KEY configured')
      return null
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/fixtures/headtohead?h2h=${team1Id}-${team2Id}&last=${last}`,
        {
          headers: {
            'x-apisports-key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const fixtures = data.response || []

      if (!fixtures.length) return null

      let team1Wins = 0
      let team2Wins = 0
      let draws = 0
      let totalGoals = 0

      const results = fixtures.map((fixture: any) => {
        const homeGoals = fixture.goals.home
        const awayGoals = fixture.goals.away
        totalGoals += homeGoals + awayGoals

        if (homeGoals > awayGoals) {
          if (fixture.teams.home.id === team1Id) team1Wins++
          else team2Wins++
          return 'W'
        } else if (homeGoals < awayGoals) {
          if (fixture.teams.away.id === team1Id) team1Wins++
          else team2Wins++
          return 'W'
        } else {
          draws++
          return 'D'
        }
      })

      return {
        team1Wins,
        team2Wins,
        draws,
        avgGoals: parseFloat((totalGoals / fixtures.length).toFixed(2)),
        lastResults: results.slice(0, 5),
        totalMatches: fixtures.length,
      }
    } catch (error) {
      this.logger.error(`Error fetching H2H: ${error.message}`)
      return null
    }
  }

  /**
   * Get injuries and suspensions for a team
   */
  async getInjuries(teamId: number): Promise<any> {
    if (!this.apiKey) {
      this.logger.warn('No API_FOOTBALL_KEY configured')
      return []
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/injuries?team=${teamId}`,
        {
          headers: {
            'x-apisports-key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const injuries = data.response || []

      return injuries.map((injury: any) => ({
        player: injury.player.name,
        type: injury.player.type, // Injury, Suspension, etc
        reason: injury.player.reason,
      }))
    } catch (error) {
      this.logger.error(`Error fetching injuries: ${error.message}`)
      return []
    }
  }

  /**
   * Get fixture congestion (recent games for a team)
   */
  async getFixtureCongestion(teamId: number, days = 7): Promise<any> {
    if (!this.apiKey) {
      this.logger.warn('No API_FOOTBALL_KEY configured')
      return null
    }

    try {
      const today = new Date()
      const pastDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
      const futureDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000)

      const from = pastDate.toISOString().split('T')[0]
      const to = futureDate.toISOString().split('T')[0]

      const response = await fetch(
        `${this.baseUrl}/fixtures?team=${teamId}&from=${from}&to=${to}`,
        {
          headers: {
            'x-apisports-key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const fixtures = data.response || []

      const now = Date.now()
      const recentGames = fixtures.filter(
        (f: any) => new Date(f.fixture.date).getTime() < now
      ).length

      const upcomingGames = fixtures.filter(
        (f: any) => new Date(f.fixture.date).getTime() > now
      )

      const nextGame = upcomingGames.length > 0 
        ? new Date(upcomingGames[0].fixture.date)
        : null

      return {
        recentGames,
        upcomingGames: upcomingGames.length,
        nextGame: nextGame?.toISOString(),
        fixtures: fixtures.map((f: any) => ({
          date: f.fixture.date,
          opponent: f.teams.home.id === teamId ? f.teams.away.name : f.teams.home.name,
          competition: f.league.name,
        })),
      }
    } catch (error) {
      this.logger.error(`Error fetching fixture congestion: ${error.message}`)
      return null
    }
  }

  /**
   * Search team by name to get ID
   */
  async searchTeam(teamName: string): Promise<number | null> {
    if (!this.apiKey) {
      this.logger.warn('No API_FOOTBALL_KEY configured')
      return null
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/teams?search=${encodeURIComponent(teamName)}`,
        {
          headers: {
            'x-apisports-key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const teams = data.response || []

      if (teams.length > 0) {
        return teams[0].team.id
      }

      return null
    } catch (error) {
      this.logger.error(`Error searching team: ${error.message}`)
      return null
    }
  }

  cleanupCache(): void {
    const now = Date.now()
    Array.from(this.fixturesCache.entries()).forEach(([key, entry]) => {
      if (now > entry.expiresAt) {
        this.fixturesCache.delete(key)
      }
    })
  }
}
