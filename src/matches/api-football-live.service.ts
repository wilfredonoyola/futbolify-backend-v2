import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisCacheService } from '../common/redis-cache.service'

/**
 * Cache TTL for live matches (in seconds)
 */
const CACHE_TTL = {
  LIVE_MATCHES: 60, // 1 minute - partidos en vivo
  LIVE_MATCH_DETAILS: 30, // 30 seconds - detalles de partido
  FINISHED_MATCHES: 300, // 5 minutes - partidos terminados
  STANDINGS: 3600, // 1 hour - standings change less frequently
}

/**
 * League ID mapping for API-Football
 * Maps our frontend league IDs to API-Football league IDs
 */
const LEAGUE_MAP: Record<string, { apiId: number; name: string }> = {
  // Top European Leagues
  'premier-league': { apiId: 39, name: 'Premier League' },
  'la-liga': { apiId: 140, name: 'La Liga' },
  'serie-a': { apiId: 135, name: 'Serie A' },
  'bundesliga': { apiId: 78, name: 'Bundesliga' },
  'ligue-1': { apiId: 61, name: 'Ligue 1' },
  'eredivisie': { apiId: 88, name: 'Eredivisie' },
  'primeira-liga': { apiId: 94, name: 'Primeira Liga' },
  // UEFA Competitions
  'champions-league': { apiId: 2, name: 'UEFA Champions League' },
  'europa-league': { apiId: 3, name: 'UEFA Europa League' },
  'conference-league': { apiId: 848, name: 'UEFA Conference League' },
  // Americas
  'liga-mx': { apiId: 262, name: 'Liga MX' },
  'mls': { apiId: 253, name: 'MLS' },
  'copa-libertadores': { apiId: 13, name: 'Copa Libertadores' },
  'copa-america': { apiId: 11, name: 'Copa America' },
  // World
  'mundial-2026': { apiId: 1, name: 'World Cup' },
}

/**
 * Reverse mapping: API-Football league ID to our frontend league ID
 */
const REVERSE_LEAGUE_MAP: Record<number, string> = Object.entries(LEAGUE_MAP).reduce(
  (acc, [key, value]) => {
    acc[value.apiId] = key
    return acc
  },
  {} as Record<number, string>
)

/**
 * Allowed leagues for live matches display
 * Only matches from these leagues will be shown
 */
const ALLOWED_LEAGUE_IDS: number[] = [
  // Top European Leagues
  39,   // Premier League (England)
  140,  // La Liga (Spain)
  135,  // Serie A (Italy)
  78,   // Bundesliga (Germany)
  61,   // Ligue 1 (France)
  88,   // Eredivisie (Netherlands)
  94,   // Primeira Liga (Portugal)
  // UEFA Competitions
  2,    // Champions League
  3,    // Europa League
  848,  // Conference League
  // Americas
  262,  // Liga MX (Mexico)
  253,  // MLS (USA)
  13,   // Copa Libertadores
  11,   // Copa America
  // World
  1,    // World Cup
]

export interface LiveMatchData {
  id: number
  homeTeam: string
  awayTeam: string
  leagueId: string | null
  leagueName: string | null
  leagueLogo: string | null
  scoreHome: number
  scoreAway: number
  minute: number
  status: string
  elapsed: number | null
  events?: MatchEvent[]
  statistics?: MatchStatistics
}

export interface MatchEvent {
  time: number
  type: string
  team: string
  player: string
  detail: string
}

export interface MatchStatistics {
  possession?: { home: number; away: number }
  shots?: { home: number; away: number }
  shotsOnTarget?: { home: number; away: number }
  corners?: { home: number; away: number }
  fouls?: { home: number; away: number }
}

export interface TeamStanding {
  rank: number
  teamId: number | null
  teamName: string
  teamLogo: string | null
  points: number
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  form: string | null
  description: string | null // "Champions League", "Relegation", "Playoff", etc.
}

export interface StandingsGroup {
  name: string // "Group A", "La Liga", etc.
  teams: TeamStanding[]
}

export interface LeagueStandings {
  leagueId: string
  leagueName: string
  leagueLogo: string | null
  country: string
  season: number
  type: 'league' | 'groups' // Single table vs multiple groups
  groups: StandingsGroup[]
}

@Injectable()
export class ApiFootballLiveService {
  private readonly logger = new Logger(ApiFootballLiveService.name)
  private readonly apiKey: string
  private readonly baseUrl = 'https://v3.football.api-sports.io'

  constructor(
    private readonly configService: ConfigService,
    private readonly redisCache: RedisCacheService
  ) {
    this.apiKey = this.configService.get<string>('API_FOOTBALL_KEY') || ''
    if (!this.apiKey) {
      this.logger.warn('⚠️ API_FOOTBALL_KEY not configured')
    }
  }

  /**
   * Get all live matches across all leagues
   * Uses Redis cache to minimize API calls
   */
  async getLiveMatches(): Promise<LiveMatchData[]> {
    const cacheKey = 'api-football:live-matches:all'

    // Check Redis cache first
    const cached = await this.redisCache.get<LiveMatchData[]>(cacheKey)
    if (cached) {
      this.logger.debug(`♻️ Cache hit for live matches (${cached.length} matches)`)
      return cached
    }

    if (!this.apiKey) {
      this.logger.warn('No API key, returning empty')
      return []
    }

    try {
      const response = await fetch(`${this.baseUrl}/fixtures?live=all`, {
        headers: {
          'x-apisports-key': this.apiKey,
        },
      })

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`API error ${response.status}: ${error}`)
        return []
      }

      const data = await response.json()
      const allFixtures = data.response || []

      // Filter to only allowed leagues
      const fixtures = allFixtures.filter(
        (fixture: any) => ALLOWED_LEAGUE_IDS.includes(fixture.league?.id)
      )

      this.logger.log(
        `✅ Fetched ${fixtures.length} live matches from allowed leagues (${allFixtures.length} total)`
      )

      const matches: LiveMatchData[] = fixtures.map((fixture: any) =>
        this.transformFixture(fixture)
      )

      // Cache in Redis
      await this.redisCache.set(cacheKey, matches, CACHE_TTL.LIVE_MATCHES)

      return matches
    } catch (error) {
      this.logger.error(`Error fetching live matches: ${error.message}`)
      return []
    }
  }

  /**
   * Get live matches for a specific league
   */
  async getLiveMatchesByLeague(leagueId: string): Promise<LiveMatchData[]> {
    const leagueInfo = LEAGUE_MAP[leagueId]
    if (!leagueInfo) {
      this.logger.warn(`Unknown league: ${leagueId}`)
      return []
    }

    const cacheKey = `api-football:live-matches:${leagueId}`

    // Check Redis cache
    const cached = await this.redisCache.get<LiveMatchData[]>(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/fixtures?live=all&league=${leagueInfo.apiId}`,
        {
          headers: {
            'x-apisports-key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      const fixtures = data.response || []

      const matches: LiveMatchData[] = fixtures.map((fixture: any) =>
        this.transformFixture(fixture)
      )

      await this.redisCache.set(cacheKey, matches, CACHE_TTL.LIVE_MATCHES)

      return matches
    } catch (error) {
      this.logger.error(`Error fetching matches for ${leagueId}: ${error.message}`)
      return []
    }
  }

  /**
   * Get detailed live match data with statistics
   */
  async getLiveMatchDetails(fixtureId: number): Promise<LiveMatchData | null> {
    const cacheKey = `api-football:match-details:${fixtureId}`

    // Check Redis cache
    const cached = await this.redisCache.get<LiveMatchData>(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      // Fetch fixture, events, and statistics in parallel
      const [fixtureRes, eventsRes, statsRes] = await Promise.all([
        fetch(`${this.baseUrl}/fixtures?id=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(`${this.baseUrl}/fixtures/events?fixture=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(`${this.baseUrl}/fixtures/statistics?fixture=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
      ])

      const [fixtureData, eventsData, statsData] = await Promise.all([
        fixtureRes.json(),
        eventsRes.json(),
        statsRes.json(),
      ])

      const fixture = fixtureData.response?.[0]
      if (!fixture) {
        return null
      }

      const match = this.transformFixture(fixture)

      // Add events
      match.events = (eventsData.response || []).map((event: any) => ({
        time: event.time.elapsed,
        type: event.type,
        team: event.team.name,
        player: event.player?.name || '',
        detail: event.detail || '',
      }))

      // Add statistics
      const stats = statsData.response || []
      if (stats.length >= 2) {
        match.statistics = this.parseStatistics(stats)
      }

      // Cache based on match status
      const isFinished = fixture.fixture.status.short === 'FT'
      const ttl = isFinished ? CACHE_TTL.FINISHED_MATCHES : CACHE_TTL.LIVE_MATCH_DETAILS

      await this.redisCache.set(cacheKey, match, ttl)

      return match
    } catch (error) {
      this.logger.error(`Error fetching match details: ${error.message}`)
      return null
    }
  }

  /**
   * Get upcoming matches for today and tomorrow from allowed leagues
   */
  async getUpcomingMatches(): Promise<LiveMatchData[]> {
    const cacheKey = 'api-football:upcoming-matches'

    const cached = await this.redisCache.get<LiveMatchData[]>(cacheKey)
    if (cached) {
      this.logger.debug(`♻️ Cache hit for upcoming matches (${cached.length} matches)`)
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      // Get today and tomorrow's dates
      const today = new Date()
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const todayStr = today.toISOString().split('T')[0]
      const tomorrowStr = tomorrow.toISOString().split('T')[0]

      // Fetch matches for both days in parallel
      const [todayRes, tomorrowRes] = await Promise.all([
        fetch(`${this.baseUrl}/fixtures?date=${todayStr}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(`${this.baseUrl}/fixtures?date=${tomorrowStr}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
      ])

      const [todayData, tomorrowData] = await Promise.all([
        todayRes.json(),
        tomorrowRes.json(),
      ])

      const allFixtures = [
        ...(todayData.response || []),
        ...(tomorrowData.response || []),
      ]

      // Filter: only allowed leagues and not started matches
      const upcomingFixtures = allFixtures.filter((fixture: any) => {
        const isAllowedLeague = ALLOWED_LEAGUE_IDS.includes(fixture.league?.id)
        const isNotStarted = fixture.fixture.status.short === 'NS'
        return isAllowedLeague && isNotStarted
      })

      this.logger.log(
        `✅ Found ${upcomingFixtures.length} upcoming matches from allowed leagues`
      )

      const matches: LiveMatchData[] = upcomingFixtures.map((fixture: any) =>
        this.transformFixture(fixture)
      )

      // Sort by date
      matches.sort((a, b) => a.minute - b.minute)

      // Cache for 5 minutes
      await this.redisCache.set(cacheKey, matches, 300)

      return matches
    } catch (error) {
      this.logger.error(`Error fetching upcoming matches: ${error.message}`)
      return []
    }
  }

  /**
   * Get recently finished matches (last 2 hours)
   */
  async getRecentlyFinishedMatches(): Promise<LiveMatchData[]> {
    const cacheKey = 'api-football:finished-matches:recent'

    const cached = await this.redisCache.get<LiveMatchData[]>(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      // Get today's date
      const today = new Date().toISOString().split('T')[0]

      const response = await fetch(
        `${this.baseUrl}/fixtures?date=${today}&status=FT`,
        {
          headers: {
            'x-apisports-key': this.apiKey,
          },
        }
      )

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      const fixtures = data.response || []

      // Filter to matches finished in the last 2 hours AND from allowed leagues
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      const recentMatches = fixtures.filter((f: any) => {
        const matchEnd = new Date(f.fixture.date).getTime() + 2 * 60 * 60 * 1000
        const isRecent = matchEnd > twoHoursAgo
        const isAllowedLeague = ALLOWED_LEAGUE_IDS.includes(f.league?.id)
        return isRecent && isAllowedLeague
      })

      const matches: LiveMatchData[] = recentMatches.map((fixture: any) =>
        this.transformFixture(fixture)
      )

      await this.redisCache.set(cacheKey, matches, CACHE_TTL.FINISHED_MATCHES)

      return matches
    } catch (error) {
      this.logger.error(`Error fetching finished matches: ${error.message}`)
      return []
    }
  }

  /**
   * Transform API-Football fixture to our format
   */
  private transformFixture(fixture: any): LiveMatchData {
    const leagueApiId = fixture.league?.id
    const leagueId = REVERSE_LEAGUE_MAP[leagueApiId] || null

    return {
      id: fixture.fixture.id,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      leagueId,
      leagueName: fixture.league?.name || null,
      leagueLogo: fixture.league?.logo || null,
      scoreHome: fixture.goals?.home ?? 0,
      scoreAway: fixture.goals?.away ?? 0,
      minute: fixture.fixture.status.elapsed || 0,
      status: fixture.fixture.status.short,
      elapsed: fixture.fixture.status.elapsed,
    }
  }

  /**
   * Parse statistics from API response
   */
  private parseStatistics(stats: any[]): MatchStatistics {
    const homeStats = stats[0]?.statistics || []
    const awayStats = stats[1]?.statistics || []

    const findStat = (arr: any[], type: string): number => {
      const stat = arr.find((s: any) => s.type === type)
      return stat?.value ?? 0
    }

    const parsePossession = (value: any): number => {
      if (typeof value === 'string') {
        return parseInt(value.replace('%', ''), 10) || 0
      }
      return value || 0
    }

    return {
      possession: {
        home: parsePossession(findStat(homeStats, 'Ball Possession')),
        away: parsePossession(findStat(awayStats, 'Ball Possession')),
      },
      shots: {
        home: findStat(homeStats, 'Total Shots'),
        away: findStat(awayStats, 'Total Shots'),
      },
      shotsOnTarget: {
        home: findStat(homeStats, 'Shots on Goal'),
        away: findStat(awayStats, 'Shots on Goal'),
      },
      corners: {
        home: findStat(homeStats, 'Corner Kicks'),
        away: findStat(awayStats, 'Corner Kicks'),
      },
      fouls: {
        home: findStat(homeStats, 'Fouls'),
        away: findStat(awayStats, 'Fouls'),
      },
    }
  }

  /**
   * Get standings for any league
   * Works for both single-table leagues (La Liga) and group-based (World Cup, Champions)
   */
  async getStandings(leagueId: string, season?: number): Promise<LeagueStandings | null> {
    const leagueInfo = LEAGUE_MAP[leagueId]
    if (!leagueInfo) {
      this.logger.warn(`Unknown league: ${leagueId}`)
      return null
    }

    // Determine season - use current year or provided
    const currentYear = new Date().getFullYear()
    const targetSeason = season || currentYear

    const cacheKey = `api-football:standings:${leagueId}:${targetSeason}`

    // Check cache
    const cached = await this.redisCache.get<LeagueStandings>(cacheKey)
    if (cached) {
      this.logger.debug(`♻️ Cache hit for standings ${leagueId}`)
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/standings?league=${leagueInfo.apiId}&season=${targetSeason}`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        this.logger.error(`Standings API error: ${response.status}`)
        return null
      }

      const data = await response.json()
      const leagueData = data.response?.[0]?.league

      if (!leagueData) {
        this.logger.warn(`No standings found for ${leagueId} season ${targetSeason}`)
        return null
      }

      // Transform standings
      const standings = leagueData.standings || []
      const isGroupBased = Array.isArray(standings[0]) && standings.length > 1

      const groups: StandingsGroup[] = isGroupBased
        ? standings.map((group: any[]) => ({
            name: group[0]?.group || 'Group',
            teams: group
              .filter((t: any) => !t.group?.includes('third-placed')) // Exclude third-placed ranking
              .map((t: any) => this.transformStanding(t)),
          }))
        : [
            {
              name: leagueInfo.name,
              teams: (standings[0] || []).map((t: any) => this.transformStanding(t)),
            },
          ]

      const result: LeagueStandings = {
        leagueId,
        leagueName: leagueData.name,
        leagueLogo: leagueData.logo,
        country: leagueData.country,
        season: targetSeason,
        type: isGroupBased ? 'groups' : 'league',
        groups,
      }

      // Cache for 1 hour
      await this.redisCache.set(cacheKey, result, CACHE_TTL.STANDINGS)

      this.logger.log(
        `✅ Fetched standings for ${leagueId}: ${groups.length} group(s), ${groups.reduce((acc, g) => acc + g.teams.length, 0)} teams`
      )

      return result
    } catch (error) {
      this.logger.error(`Error fetching standings: ${error.message}`)
      return null
    }
  }

  /**
   * Transform API standing to our format
   */
  private transformStanding(standing: any): TeamStanding {
    return {
      rank: standing.rank,
      teamId: standing.team?.id || null,
      teamName: standing.team?.name || 'TBD',
      teamLogo: standing.team?.logo || null,
      points: standing.points || 0,
      played: standing.all?.played || 0,
      won: standing.all?.win || 0,
      drawn: standing.all?.draw || 0,
      lost: standing.all?.lose || 0,
      goalsFor: standing.all?.goals?.for || 0,
      goalsAgainst: standing.all?.goals?.against || 0,
      goalDiff: standing.goalsDiff || 0,
      form: standing.form || null,
      description: standing.description || null,
    }
  }

  /**
   * Get list of available leagues
   */
  getAvailableLeagues(): Array<{ id: string; name: string; apiId: number }> {
    return Object.entries(LEAGUE_MAP).map(([id, info]) => ({
      id,
      name: info.name,
      apiId: info.apiId,
    }))
  }

  /**
   * Clear all live match caches
   */
  async clearCache(): Promise<void> {
    await this.redisCache.deletePattern('api-football:*')
    this.logger.log('🗑️ Cleared all API-Football cache')
  }
}
