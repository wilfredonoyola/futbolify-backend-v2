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
 * League configuration for API-Football
 * Maps our frontend league IDs to API-Football league IDs with full metadata
 */
interface LeagueConfig {
  apiId: number
  name: string
  country: string | null // null for international competitions
  order: number // Display order (lower = higher priority)
  isActive: boolean
}

const LEAGUE_MAP: Record<string, LeagueConfig> = {
  // World Cup - Top priority
  'mundial-2026': { apiId: 1, name: 'Mundial 2026', country: null, order: 0, isActive: true },
  // UEFA Competitions
  'champions-league': { apiId: 2, name: 'Champions League', country: null, order: 1, isActive: true },
  'europa-league': { apiId: 3, name: 'Europa League', country: null, order: 2, isActive: true },
  // Top European Leagues
  'la-liga': { apiId: 140, name: 'La Liga', country: 'España', order: 10, isActive: true },
  'premier-league': { apiId: 39, name: 'Premier League', country: 'Inglaterra', order: 11, isActive: true },
  'serie-a': { apiId: 135, name: 'Serie A', country: 'Italia', order: 12, isActive: true },
  'bundesliga': { apiId: 78, name: 'Bundesliga', country: 'Alemania', order: 13, isActive: true },
  'ligue-1': { apiId: 61, name: 'Ligue 1', country: 'Francia', order: 14, isActive: true },
  // Americas
  'liga-mx': { apiId: 262, name: 'Liga MX', country: 'México', order: 20, isActive: true },
  'mls': { apiId: 253, name: 'MLS', country: 'USA', order: 21, isActive: true },
  'copa-libertadores': { apiId: 13, name: 'Copa Libertadores', country: null, order: 22, isActive: true },
  'copa-america': { apiId: 11, name: 'Copa América', country: null, order: 23, isActive: false }, // Not active yet
  // Other European
  'eredivisie': { apiId: 88, name: 'Eredivisie', country: 'Países Bajos', order: 30, isActive: false },
  'primeira-liga': { apiId: 94, name: 'Primeira Liga', country: 'Portugal', order: 31, isActive: false },
  'conference-league': { apiId: 848, name: 'Conference League', country: null, order: 32, isActive: false },
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
  homeTeamLogo: string | null
  awayTeamLogo: string | null
  homeTeamId?: number | null
  awayTeamId?: number | null
  leagueId: string | null
  leagueName: string | null
  leagueLogo: string | null
  scoreHome: number
  scoreAway: number
  minute: number
  status: string
  elapsed: number | null
  kickoffTime: string | null // ISO date string
  round: string | null // "Round of 16", "Quarter-finals", "Regular Season - 25", etc.
  events?: MatchEvent[]
  statistics?: MatchStatistics
  lineups?: MatchLineupsRaw
}

/** Alineaciones crudas antes de mapear a DTO GraphQL. */
export interface LineupPlayerRaw {
  id: number
  name: string
  number: number | null
  pos: string | null
  grid: string | null
}

export interface TeamLineupRaw {
  teamName: string
  teamLogo: string | null
  formation: string | null
  coachName: string | null
  startXI: LineupPlayerRaw[]
  substitutes: LineupPlayerRaw[]
}

export interface MatchLineupsRaw {
  home: TeamLineupRaw | null
  away: TeamLineupRaw | null
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
      // Fixture, eventos, estadísticas y alineaciones en paralelo (mismo cache Redis).
      const [fixtureRes, eventsRes, statsRes, lineupsRes] = await Promise.all([
        fetch(`${this.baseUrl}/fixtures?id=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(`${this.baseUrl}/fixtures/events?fixture=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(`${this.baseUrl}/fixtures/statistics?fixture=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(`${this.baseUrl}/fixtures/lineups?fixture=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
      ])

      const [fixtureData, eventsData, statsData, lineupsData] = await Promise.all([
        fixtureRes.json(),
        eventsRes.json(),
        statsRes.json(),
        lineupsRes.ok ? lineupsRes.json() : Promise.resolve({ response: [] }),
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

      match.lineups = this.parseLineups(lineupsData.response || [], fixture)

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
   * Get upcoming matches for a specific league
   * For cups/tournaments: looks up to 60 days ahead (knockout matches are spread out)
   * For domestic leagues: looks 14 days ahead
   */
  async getUpcomingMatchesByLeague(leagueId: string): Promise<LiveMatchData[]> {
    const leagueInfo = LEAGUE_MAP[leagueId]
    if (!leagueInfo) {
      this.logger.warn(`Unknown league: ${leagueId}`)
      return []
    }

    const cacheKey = `api-football:upcoming-matches:${leagueId}`

    const cached = await this.redisCache.get<LiveMatchData[]>(cacheKey)
    if (cached) {
      this.logger.debug(`♻️ Cache hit for upcoming matches ${leagueId} (${cached.length})`)
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      const today = new Date()
      const futureDate = new Date(today)

      // Cup competitions (Champions League, Europa League, World Cup, Copa America, etc.)
      // have matches spread over longer periods - look further ahead
      const isCupCompetition = !leagueInfo.country ||
        ['champions-league', 'europa-league', 'mundial-2026', 'copa-america', 'euro'].includes(leagueId)

      if (isCupCompetition) {
        // Look 60 days ahead for cups (knockout rounds are spread out)
        futureDate.setDate(futureDate.getDate() + 60)
      } else {
        // Look 14 days ahead for domestic leagues
        futureDate.setDate(futureDate.getDate() + 14)
      }

      const fromDate = today.toISOString().split('T')[0]
      const toDate = futureDate.toISOString().split('T')[0]

      // European leagues run Aug-May, so Jan-Jul = previous year's season
      const currentMonth = today.getMonth() + 1
      const currentYear = today.getFullYear()
      const season = currentMonth <= 7 ? currentYear - 1 : currentYear

      this.logger.log(`🔍 Fetching matches for ${leagueId} (cup: ${isCupCompetition}) from ${fromDate} to ${toDate}, season ${season}`)

      const response = await fetch(
        `${this.baseUrl}/fixtures?league=${leagueInfo.apiId}&season=${season}&from=${fromDate}&to=${toDate}`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        this.logger.error(`API error: ${response.status}`)
        return []
      }

      const data = await response.json()
      const fixtures = data.response || []

      // Filter only not started matches
      const upcomingFixtures = fixtures.filter(
        (f: any) => f.fixture.status.short === 'NS'
      )

      this.logger.log(
        `✅ Found ${upcomingFixtures.length} upcoming matches for ${leagueId}`
      )

      const matches: LiveMatchData[] = upcomingFixtures.map((fixture: any) =>
        this.transformFixture(fixture)
      )

      // Sort by kickoff time
      matches.sort(
        (a, b) => new Date(a.kickoffTime || 0).getTime() - new Date(b.kickoffTime || 0).getTime()
      )

      // For cup competitions, detect and add leg info (1st Leg / 2nd Leg)
      if (isCupCompetition) {
        this.addLegInfoToMatches(matches)
      }

      // Cache for 5 minutes
      await this.redisCache.set(cacheKey, matches, 300)

      return matches
    } catch (error) {
      this.logger.error(`Error fetching upcoming for ${leagueId}: ${error.message}`)
      return []
    }
  }

  /**
   * Recently finished fixtures for a league (last N days), for matchesByLeague(status=finished).
   * Cached in Redis to limit API-Football usage.
   */
  async getFinishedMatchesByLeague(
    leagueId: string,
    daysBack: number = 7
  ): Promise<LiveMatchData[]> {
    const leagueInfo = LEAGUE_MAP[leagueId]
    if (!leagueInfo) {
      this.logger.warn(`Unknown league: ${leagueId}`)
      return []
    }

    const cacheKey = `api-football:finished-matches:league:${leagueId}:${daysBack}`

    const cached = await this.redisCache.get<LiveMatchData[]>(cacheKey)
    if (cached) {
      this.logger.debug(
        `♻️ Cache hit for finished matches ${leagueId} (${cached.length})`
      )
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      const today = new Date()
      const from = new Date(today)
      from.setDate(from.getDate() - daysBack)
      const fromStr = from.toISOString().split('T')[0]
      const toStr = today.toISOString().split('T')[0]

      const currentMonth = today.getMonth() + 1
      const currentYear = today.getFullYear()
      const season = currentMonth <= 7 ? currentYear - 1 : currentYear

      const response = await fetch(
        `${this.baseUrl}/fixtures?league=${leagueInfo.apiId}&season=${season}&from=${fromStr}&to=${toStr}&status=FT`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        this.logger.error(`Finished fixtures API error: ${response.status}`)
        return []
      }

      const data = await response.json()
      const fixtures = data.response || []

      const matches: LiveMatchData[] = fixtures.map((fixture: any) =>
        this.transformFixture(fixture)
      )

      matches.sort(
        (a, b) =>
          new Date(b.kickoffTime || 0).getTime() -
          new Date(a.kickoffTime || 0).getTime()
      )

      await this.redisCache.set(cacheKey, matches, CACHE_TTL.FINISHED_MATCHES)

      this.logger.log(
        `✅ ${matches.length} finished matches for ${leagueId} (${fromStr}–${toStr})`
      )

      return matches
    } catch (error) {
      this.logger.error(
        `Error fetching finished matches for ${leagueId}: ${error.message}`
      )
      return []
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
      homeTeamLogo: fixture.teams.home.logo || null,
      awayTeamLogo: fixture.teams.away.logo || null,
      homeTeamId: fixture.teams.home.id || null,
      awayTeamId: fixture.teams.away.id || null,
      leagueId,
      leagueName: fixture.league?.name || null,
      leagueLogo: fixture.league?.logo || null,
      scoreHome: fixture.goals?.home ?? 0,
      scoreAway: fixture.goals?.away ?? 0,
      minute: fixture.fixture.status.elapsed || 0,
      status: fixture.fixture.status.short,
      elapsed: fixture.fixture.status.elapsed,
      kickoffTime: fixture.fixture.date || null,
      round: fixture.league?.round || null,
    }
  }

  /**
   * Add leg info (1st Leg / 2nd Leg) to knockout matches based on dates
   * Modifies matches in place
   */
  private addLegInfoToMatches(matches: LiveMatchData[]): void {
    // Check if round already contains leg info
    const hasLegInfo = matches.some(m =>
      m.round?.toLowerCase().includes('leg') ||
      m.round?.toLowerCase().includes('ida') ||
      m.round?.toLowerCase().includes('vuelta')
    )

    if (hasLegInfo) {
      return // API already provides leg info
    }

    // Group matches by base round (e.g., "Quarter-finals")
    const byRound: Record<string, LiveMatchData[]> = {}

    for (const match of matches) {
      if (!match.round || !this.isKnockoutRound(match.round)) {
        continue
      }

      const baseRound = match.round
      if (!byRound[baseRound]) {
        byRound[baseRound] = []
      }
      byRound[baseRound].push(match)
    }

    // For each round, detect 1st/2nd leg by date
    for (const round of Object.keys(byRound)) {
      const roundMatches = byRound[round]

      // Get unique dates
      const dateToMatches: Record<string, LiveMatchData[]> = {}

      for (const match of roundMatches) {
        const dateStr = match.kickoffTime?.split('T')[0] || ''
        if (!dateToMatches[dateStr]) {
          dateToMatches[dateStr] = []
        }
        dateToMatches[dateStr].push(match)
      }

      // Sort dates
      const sortedDates = Object.keys(dateToMatches).sort()

      // If we have exactly 2 date groups, it's 1st leg and 2nd leg
      if (sortedDates.length >= 2) {
        // First date(s) = 1st Leg
        const firstLegDates = sortedDates.slice(0, Math.ceil(sortedDates.length / 2))
        // Second date(s) = 2nd Leg
        const secondLegDates = sortedDates.slice(Math.ceil(sortedDates.length / 2))

        for (const date of firstLegDates) {
          for (const match of dateToMatches[date]) {
            match.round = `${round} - 1st Leg`
          }
        }

        for (const date of secondLegDates) {
          for (const match of dateToMatches[date]) {
            match.round = `${round} - 2nd Leg`
          }
        }

        this.logger.log(`📌 Added leg info to ${round}: ${firstLegDates.join(',')} = 1st Leg, ${secondLegDates.join(',')} = 2nd Leg`)
      }
    }
  }

  /**
   * Check if a round name indicates a knockout phase
   */
  private isKnockoutRound(round: string): boolean {
    const lower = round.toLowerCase()
    return (
      lower.includes('quarter') ||
      lower.includes('semi') ||
      lower.includes('final') ||
      lower.includes('round of 32') ||
      lower.includes('round of 16') ||
      lower.includes('8th') ||
      lower.includes('knockout') ||
      lower.includes('play-off')
    )
  }

  /**
   * Alineaciones por equipo local / visitante (ids del fixture).
   */
  private parseLineups(lineupsRows: any[], fixture: any): MatchLineupsRaw | null {
    if (!lineupsRows?.length || !fixture?.teams) {
      return null
    }

    const homeId = fixture.teams.home?.id
    const awayId = fixture.teams.away?.id
    let home: TeamLineupRaw | null = null
    let away: TeamLineupRaw | null = null

    for (const row of lineupsRows) {
      const tid = row.team?.id
      const mapped = this.mapTeamLineupRow(row)
      if (tid === homeId) {
        home = mapped
      } else if (tid === awayId) {
        away = mapped
      }
    }

    if (!home && !away) {
      return null
    }

    return { home, away }
  }

  private mapTeamLineupRow(row: any): TeamLineupRaw {
    const startXI = (row.startXI || [])
      .map((e: any) => this.mapLineupPlayerEntry(e))
      .filter((p: LineupPlayerRaw | null): p is LineupPlayerRaw => p !== null)

    const substitutes = (row.substitutes || [])
      .map((e: any) => this.mapLineupPlayerEntry(e))
      .filter((p: LineupPlayerRaw | null): p is LineupPlayerRaw => p !== null)

    return {
      teamName: row.team?.name || '',
      teamLogo: row.team?.logo || null,
      formation: row.formation || null,
      coachName: row.coach?.name || null,
      startXI,
      substitutes,
    }
  }

  private mapLineupPlayerEntry(entry: any): LineupPlayerRaw | null {
    const p = entry?.player ?? entry
    if (!p?.id && !p?.name) {
      return null
    }

    return {
      id: typeof p.id === 'number' ? p.id : Number(p.id) || 0,
      name: p.name || '',
      number: p.number != null ? Number(p.number) : null,
      pos: p.pos || null,
      grid: p.grid || null,
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
    // European leagues run Aug-May, so Jan-Jul = previous year's season
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1 // 1-12
    // If we're in Jan-Jul, we're in the second half of season (started previous year)
    const defaultSeason = currentMonth <= 7 ? currentYear - 1 : currentYear
    const targetSeason = season || defaultSeason

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

      this.logger.log(`📊 Standings response for ${leagueId}: ${JSON.stringify(data.response?.length || 0)} entries`)

      if (!leagueData) {
        this.logger.warn(`No standings found for ${leagueId} season ${targetSeason}`)
        return null
      }

      // Transform standings
      const standings = leagueData.standings || []
      this.logger.log(`📊 Standings format: ${standings.length} groups, first item is array: ${Array.isArray(standings[0])}`)

      // Champions League new format (2024+) has a single league table
      // Traditional cups have groups (arrays of arrays)
      const isGroupBased = Array.isArray(standings[0]) && standings.length > 1

      const groups: StandingsGroup[] = isGroupBased
        ? standings
            .map((group: any[]) => ({
              name: group[0]?.group || 'Group',
              teams: group
                .filter((t: any) => !t.group?.includes('third-placed')) // Exclude third-placed ranking
                .map((t: any) => this.transformStanding(t)),
            }))
            // Filter out empty groups (like "Ranking of third-placed teams" after team filtering)
            .filter((g: StandingsGroup) => g.teams.length > 0 && !g.name.toLowerCase().includes('third-placed'))
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
   * Partidos de un día concreto (YYYY-MM-DD). Filtra ligas permitidas; opcionalmente una liga nuestra (slug).
   */
  async getFixturesByDate(
    date: string,
    leagueSlug?: string
  ): Promise<LiveMatchData[]> {
    const safeDate = date.match(/^\d{4}-\d{2}-\d{2}$/) ? date : null
    if (!safeDate) {
      this.logger.warn(`Invalid date format: ${date}`)
      return []
    }

    const leaguePart = leagueSlug || 'all'
    const cacheKey = `api-football:fixtures:date:${safeDate}:${leaguePart}`

    const cached = await this.redisCache.get<LiveMatchData[]>(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/fixtures?date=${safeDate}`,
        { headers: { 'x-apisports-key': this.apiKey } }
      )

      if (!response.ok) {
        return []
      }

      const data = await response.json()
      let fixtures: any[] = data.response || []

      fixtures = fixtures.filter((f: any) =>
        ALLOWED_LEAGUE_IDS.includes(f.league?.id)
      )

      if (leagueSlug) {
        const info = LEAGUE_MAP[leagueSlug]
        if (info) {
          fixtures = fixtures.filter(
            (f: any) => f.league?.id === info.apiId
          )
        }
      }

      const matches = fixtures.map((f: any) => this.transformFixture(f))
      matches.sort(
        (a, b) =>
          new Date(a.kickoffTime || 0).getTime() -
          new Date(b.kickoffTime || 0).getTime()
      )

      await this.redisCache.set(cacheKey, matches, 300)
      return matches
    } catch (error) {
      this.logger.error(`getFixturesByDate: ${error.message}`)
      return []
    }
  }

  /**
   * Búsqueda ligera de jugadores y equipos (API-Football search).
   */
  async searchFootball(
    query: string,
    limit = 8
  ): Promise<
    Array<{
      kind: 'player' | 'team'
      id: number
      name: string
      photo?: string
      meta?: string
    }>
  > {
    const q = query.trim()
    if (q.length < 2) {
      return []
    }

    const cacheKey = `api-football:search:${q.toLowerCase()}:${limit}`
    const cached = await this.redisCache.get<
      Array<{
        kind: 'player' | 'team'
        id: number
        name: string
        photo?: string
        meta?: string
      }>
    >(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      const half = Math.ceil(limit / 2)
      const [playersRes, teamsRes] = await Promise.all([
        fetch(`${this.baseUrl}/players?search=${encodeURIComponent(q)}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(`${this.baseUrl}/teams?search=${encodeURIComponent(q)}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
      ])

      const [playersData, teamsData] = await Promise.all([
        playersRes.json(),
        teamsRes.json(),
      ])

      const out: Array<{
        kind: 'player' | 'team'
        id: number
        name: string
        photo?: string
        meta?: string
      }> = []

      for (const row of (playersData.response || []).slice(0, half)) {
        const p = row.player
        if (!p?.id) continue
        out.push({
          kind: 'player',
          id: p.id,
          name: p.name,
          photo: p.photo || undefined,
          meta: row.statistics?.[0]?.team?.name || p.nationality || undefined,
        })
      }

      for (const row of (teamsData.response || []).slice(0, half)) {
        const t = row.team
        if (!t?.id) continue
        out.push({
          kind: 'team',
          id: t.id,
          name: t.name,
          photo: t.logo || undefined,
          meta: row.venue?.city || t.nationality || undefined,
        })
      }

      await this.redisCache.set(cacheKey, out.slice(0, limit), 600)
      return out.slice(0, limit)
    } catch (error) {
      this.logger.error(`searchFootball: ${error.message}`)
      return []
    }
  }

  /**
   * Perfil de jugador + estadísticas por liga en una temporada.
   */
  async getPlayerProfile(
    playerId: number,
    season?: number
  ): Promise<{
    id: number
    name: string
    firstname?: string
    lastname?: string
    photo?: string
    nationality?: string
    birthPlace?: string
    birthDate?: string
    height?: string
    teamId?: number
    teamName?: string
    teamLogo?: string
    seasonStats: Array<{
      leagueId: string
      leagueName: string
      appearances: number
      lineups: number
      goals: number
      assists: number
      minutes: number
    }>
  } | null> {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const targetSeason =
      season ??
      (currentMonth <= 7 ? currentYear - 1 : currentYear)

    const cacheKey = `api-football:player:${playerId}:${targetSeason}`

    const cached = await this.redisCache.get<{
      id: number
      name: string
      firstname?: string
      lastname?: string
      photo?: string
      nationality?: string
      birthPlace?: string
      birthDate?: string
      height?: string
      teamId?: number
      teamName?: string
      teamLogo?: string
      seasonStats: Array<{
        leagueId: string
        leagueName: string
        appearances: number
        lineups: number
        goals: number
        assists: number
        minutes: number
      }>
    }>(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      const [playerRes, statsRes] = await Promise.all([
        fetch(`${this.baseUrl}/players?id=${playerId}&season=${targetSeason}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(
          `${this.baseUrl}/players/statistics?player=${playerId}&season=${targetSeason}`,
          { headers: { 'x-apisports-key': this.apiKey } }
        ),
      ])

      const playerData = await playerRes.json()
      const statsData = await statsRes.json()

      const row = playerData.response?.[0]
      if (!row?.player) {
        return null
      }

      const p = row.player
      const team = row.statistics?.[0]?.team

      const seasonStats: Array<{
        leagueId: string
        leagueName: string
        appearances: number
        lineups: number
        goals: number
        assists: number
        minutes: number
      }> = []

      for (const s of statsData.response || []) {
        const leagueApiId = s.league?.id
        const slug =
          (leagueApiId && REVERSE_LEAGUE_MAP[leagueApiId]) || `api-${leagueApiId}`
        const games = s.games || {}
        const goals = s.goals || {}
        seasonStats.push({
          leagueId: slug,
          leagueName: s.league?.name || 'League',
          appearances: games.appearences ?? games.appearances ?? 0,
          lineups: games.lineups ?? 0,
          goals: goals.total ?? 0,
          assists: goals.assists ?? 0,
          minutes: games.minutes ?? 0,
        })
      }

      const result = {
        id: p.id,
        name: p.name,
        firstname: p.firstname,
        lastname: p.lastname,
        photo: p.photo || undefined,
        nationality: p.nationality,
        birthPlace: p.birth?.place,
        birthDate: p.birth?.date,
        height: p.height,
        teamId: team?.id,
        teamName: team?.name,
        teamLogo: team?.logo,
        seasonStats,
      }

      await this.redisCache.set(cacheKey, result, 3600)
      return result
    } catch (error) {
      this.logger.error(`getPlayerProfile: ${error.message}`)
      return null
    }
  }

  /**
   * Get list of available leagues with full metadata
   * Returns only active leagues, sorted by display order
   */
  getAvailableLeagues(): Array<{
    id: string
    name: string
    apiId: number
    country: string | null
    logoUrl: string
    order: number
    isActive: boolean
  }> {
    return Object.entries(LEAGUE_MAP)
      .filter(([_, info]) => info.isActive) // Only return active leagues
      .map(([id, info]) => ({
        id,
        name: info.name,
        apiId: info.apiId,
        country: info.country,
        logoUrl: `https://media.api-sports.io/football/leagues/${info.apiId}.png`,
        order: info.order,
        isActive: info.isActive,
      }))
      .sort((a, b) => a.order - b.order) // Sort by display order
  }

  /**
   * Clear all live match caches
   */
  async clearCache(): Promise<void> {
    await this.redisCache.deletePattern('api-football:*')
    this.logger.log('🗑️ Cleared all API-Football cache')
  }
}
