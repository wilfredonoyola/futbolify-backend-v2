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
 * Season type for leagues:
 * - 'european': Aug-May season (Premier League, La Liga, Champions, etc.)
 * - 'calendar': Jan-Dec or Feb-Nov season (MLS, Brasileirão, J-League, etc.)
 */
type SeasonType = 'european' | 'calendar'

/**
 * League type: domestic league or international tournament
 */
type LeagueType = 'league' | 'tournament'

/**
 * League status
 */
type LeagueStatus = 'active' | 'upcoming' | 'finished' | 'offseason'

/**
 * Features available per league
 */
type LeagueFeature =
  | 'matches'
  | 'standings'
  | 'scorers'
  | 'teams'
  | 'news'
  | 'donde-ver'
  | 'quiniela'
  | 'groups'
  | 'bracket'
  | 'venues'
  | 'cities'
  | 'faqs'

/**
 * Bilingual string for i18n
 */
interface BilingualString {
  es: string
  en: string
}

/**
 * League metadata
 */
interface LeagueMetadata {
  teams?: number
  matches?: number
  groups?: number
  venues?: number
}

/**
 * Full league configuration for API-Football and frontend
 */
interface LeagueConfig {
  apiId: number
  type: LeagueType
  name: BilingualString
  shortName: BilingualString
  slug: BilingualString
  country: string | null
  confederation: string | null
  order: number
  isActive: boolean
  status: LeagueStatus
  season: string | null
  startDate: string | null
  endDate: string | null
  seasonType: SeasonType
  color: string
  colorSecondary: string | null
  features: LeagueFeature[]
  metadata: LeagueMetadata | null
}

const LEAGUE_MAP: Record<string, LeagueConfig> = {
  // World Cup - Top priority
  'mundial-2026': {
    apiId: 1,
    type: 'tournament',
    name: { es: 'Copa Mundial FIFA 2026', en: 'FIFA World Cup 2026' },
    shortName: { es: 'Mundial 2026', en: 'World Cup 2026' },
    slug: { es: 'mundial-2026', en: 'world-cup-2026' },
    country: null,
    confederation: 'FIFA',
    order: 0,
    isActive: true,
    status: 'upcoming',
    season: null,
    startDate: '2026-06-11',
    endDate: '2026-07-19',
    seasonType: 'calendar',
    color: '#8B0A1A',
    colorSecondary: '#006B3C',
    features: ['matches', 'groups', 'teams', 'news', 'donde-ver', 'quiniela', 'bracket', 'venues', 'cities', 'faqs'],
    metadata: { teams: 48, matches: 104, groups: 12, venues: 16 },
  },

  // UEFA Competitions
  'champions-league': {
    apiId: 2,
    type: 'tournament',
    name: { es: 'UEFA Champions League', en: 'UEFA Champions League' },
    shortName: { es: 'Champions', en: 'Champions League' },
    slug: { es: 'champions-league', en: 'champions-league' },
    country: null,
    confederation: 'UEFA',
    order: 1,
    isActive: true,
    status: 'active',
    season: '2025-26',
    startDate: '2025-09-16',
    endDate: '2026-05-30',
    seasonType: 'european',
    color: '#0E1E5B',
    colorSecondary: '#FFFFFF',
    features: ['matches', 'standings', 'scorers', 'teams', 'news'],
    metadata: { teams: 36, matches: 189 },
  },

  'europa-league': {
    apiId: 3,
    type: 'tournament',
    name: { es: 'UEFA Europa League', en: 'UEFA Europa League' },
    shortName: { es: 'Europa League', en: 'Europa League' },
    slug: { es: 'europa-league', en: 'europa-league' },
    country: null,
    confederation: 'UEFA',
    order: 2,
    isActive: true,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#F68E1F',
    colorSecondary: '#000000',
    features: ['matches', 'standings', 'scorers', 'teams'],
    metadata: { teams: 36 },
  },

  // Top European Leagues
  'la-liga': {
    apiId: 140,
    type: 'league',
    name: { es: 'LaLiga EA Sports', en: 'LaLiga EA Sports' },
    shortName: { es: 'La Liga', en: 'La Liga' },
    slug: { es: 'la-liga', en: 'la-liga' },
    country: 'ES',
    confederation: 'UEFA',
    order: 10,
    isActive: true,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#EE8707',
    colorSecondary: '#1A1A1A',
    features: ['matches', 'standings', 'scorers', 'teams', 'news'],
    metadata: { teams: 20, matches: 380 },
  },

  'premier-league': {
    apiId: 39,
    type: 'league',
    name: { es: 'Premier League', en: 'Premier League' },
    shortName: { es: 'Premier', en: 'Premier League' },
    slug: { es: 'premier-league', en: 'premier-league' },
    country: 'GB',
    confederation: 'UEFA',
    order: 11,
    isActive: true,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#38003C',
    colorSecondary: '#00FF87',
    features: ['matches', 'standings', 'scorers', 'teams', 'news'],
    metadata: { teams: 20, matches: 380 },
  },

  'serie-a': {
    apiId: 135,
    type: 'league',
    name: { es: 'Serie A', en: 'Serie A' },
    shortName: { es: 'Serie A', en: 'Serie A' },
    slug: { es: 'serie-a', en: 'serie-a' },
    country: 'IT',
    confederation: 'UEFA',
    order: 12,
    isActive: true,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#024494',
    colorSecondary: '#008C45',
    features: ['matches', 'standings', 'scorers', 'teams'],
    metadata: { teams: 20, matches: 380 },
  },

  'bundesliga': {
    apiId: 78,
    type: 'league',
    name: { es: 'Bundesliga', en: 'Bundesliga' },
    shortName: { es: 'Bundesliga', en: 'Bundesliga' },
    slug: { es: 'bundesliga', en: 'bundesliga' },
    country: 'DE',
    confederation: 'UEFA',
    order: 13,
    isActive: true,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#D20515',
    colorSecondary: '#000000',
    features: ['matches', 'standings', 'scorers', 'teams'],
    metadata: { teams: 18, matches: 306 },
  },

  'ligue-1': {
    apiId: 61,
    type: 'league',
    name: { es: 'Ligue 1', en: 'Ligue 1' },
    shortName: { es: 'Ligue 1', en: 'Ligue 1' },
    slug: { es: 'ligue-1', en: 'ligue-1' },
    country: 'FR',
    confederation: 'UEFA',
    order: 14,
    isActive: true,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#091C3E',
    colorSecondary: '#CDFF00',
    features: ['matches', 'standings', 'scorers', 'teams'],
    metadata: { teams: 18, matches: 306 },
  },

  // Americas
  'liga-mx': {
    apiId: 262,
    type: 'league',
    name: { es: 'Liga MX', en: 'Liga MX' },
    shortName: { es: 'Liga MX', en: 'Liga MX' },
    slug: { es: 'liga-mx', en: 'liga-mx' },
    country: 'MX',
    confederation: 'CONCACAF',
    order: 20,
    isActive: true,
    status: 'active',
    season: 'Clausura 2026',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#C8102E',
    colorSecondary: '#0A5F38',
    features: ['matches', 'standings', 'scorers', 'teams', 'news', 'donde-ver'],
    metadata: { teams: 18 },
  },

  'mls': {
    apiId: 253,
    type: 'league',
    name: { es: 'Major League Soccer', en: 'Major League Soccer' },
    shortName: { es: 'MLS', en: 'MLS' },
    slug: { es: 'mls', en: 'mls' },
    country: 'US',
    confederation: 'CONCACAF',
    order: 21,
    isActive: true,
    status: 'active',
    season: '2026',
    startDate: null,
    endDate: null,
    seasonType: 'calendar',
    color: '#000000',
    colorSecondary: '#E41E31',
    features: ['matches', 'standings', 'scorers', 'teams', 'news', 'donde-ver'],
    metadata: { teams: 29 },
  },

  'copa-libertadores': {
    apiId: 13,
    type: 'tournament',
    name: { es: 'Copa Libertadores', en: 'Copa Libertadores' },
    shortName: { es: 'Libertadores', en: 'Libertadores' },
    slug: { es: 'copa-libertadores', en: 'copa-libertadores' },
    country: null,
    confederation: 'CONMEBOL',
    order: 22,
    isActive: true,
    status: 'active',
    season: '2026',
    startDate: null,
    endDate: null,
    seasonType: 'calendar',
    color: '#1E1E1E',
    colorSecondary: '#D4AF37',
    features: ['matches', 'standings', 'scorers', 'teams'],
    metadata: { teams: 47 },
  },

  'copa-america': {
    apiId: 11,
    type: 'tournament',
    name: { es: 'Copa América', en: 'Copa America' },
    shortName: { es: 'Copa América', en: 'Copa America' },
    slug: { es: 'copa-america', en: 'copa-america' },
    country: null,
    confederation: 'CONMEBOL',
    order: 23,
    isActive: false,
    status: 'finished',
    season: '2024',
    startDate: null,
    endDate: null,
    seasonType: 'calendar',
    color: '#002776',
    colorSecondary: '#FFC72C',
    features: ['matches', 'groups', 'teams'],
    metadata: { teams: 16 },
  },

  // Other European (inactive)
  'eredivisie': {
    apiId: 88,
    type: 'league',
    name: { es: 'Eredivisie', en: 'Eredivisie' },
    shortName: { es: 'Eredivisie', en: 'Eredivisie' },
    slug: { es: 'eredivisie', en: 'eredivisie' },
    country: 'NL',
    confederation: 'UEFA',
    order: 30,
    isActive: false,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#EC1C24',
    colorSecondary: null,
    features: ['matches', 'standings', 'scorers', 'teams'],
    metadata: { teams: 18 },
  },

  'primeira-liga': {
    apiId: 94,
    type: 'league',
    name: { es: 'Primeira Liga', en: 'Primeira Liga' },
    shortName: { es: 'Liga Portugal', en: 'Liga Portugal' },
    slug: { es: 'primeira-liga', en: 'primeira-liga' },
    country: 'PT',
    confederation: 'UEFA',
    order: 31,
    isActive: false,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#00529F',
    colorSecondary: '#FCB514',
    features: ['matches', 'standings', 'scorers', 'teams'],
    metadata: { teams: 18 },
  },

  'conference-league': {
    apiId: 848,
    type: 'tournament',
    name: { es: 'UEFA Conference League', en: 'UEFA Conference League' },
    shortName: { es: 'Conference', en: 'Conference League' },
    slug: { es: 'conference-league', en: 'conference-league' },
    country: null,
    confederation: 'UEFA',
    order: 32,
    isActive: false,
    status: 'active',
    season: '2025-26',
    startDate: null,
    endDate: null,
    seasonType: 'european',
    color: '#1DB954',
    colorSecondary: '#000000',
    features: ['matches', 'standings', 'teams'],
    metadata: { teams: 36 },
  },
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

/** League top scorers row (API-Football topscorers). */
export interface TopScorerRow {
  rank: number
  playerId: number
  playerName: string
  playerPhoto?: string
  nationality?: string
  teamName: string
  teamLogo?: string
  teamId: number
  goals: number
  assists: number
  appearances: number
}

/** Team squad from API-Football players/squads. */
export interface TeamSquadRow {
  teamId: number
  teamName: string
  teamLogo?: string
  players: Array<{
    id: number
    name: string
    photo?: string
    position?: string
    number?: number
    age?: number
  }>
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
   * Get season year for API-Football based on league's seasonType config.
   * - 'european' (Aug–May): Jan-Jul = previous year, Aug-Dec = current year
   * - 'calendar' (MLS, Copa Libertadores): always current year
   */
  private getSeasonYear(leagueId?: string): number {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    // Look up league config to get seasonType
    const leagueConfig = leagueId ? LEAGUE_MAP[leagueId] : null
    const seasonType = leagueConfig?.seasonType ?? 'european'

    // Calendar year leagues use current year
    if (seasonType === 'calendar') {
      return currentYear
    }

    // European-style leagues: Aug-May season
    return currentMonth <= 7 ? currentYear - 1 : currentYear
  }

  /** @deprecated Use getSeasonYear(leagueId) instead */
  private getDefaultSeasonYear(): number {
    return this.getSeasonYear()
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

      // Get correct season based on league type (European vs calendar year)
      const season = this.getSeasonYear(leagueId)

      this.logger.log(`🔍 Fetching matches for ${leagueId} (apiId: ${leagueInfo.apiId}, cup: ${isCupCompetition}) from ${fromDate} to ${toDate}, season ${season}`)

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

      // Get correct season based on league type
      const season = this.getSeasonYear(leagueId)

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

    // Determine season - use provided or calculate based on league type
    const defaultSeason = this.getSeasonYear(leagueId)
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
   * Top scorers for a league (API-Football /players/topscorers).
   */
  async getTopScorers(
    leagueId: string,
    limit = 25,
    season?: number
  ): Promise<TopScorerRow[]> {
    const leagueInfo = LEAGUE_MAP[leagueId]
    if (!leagueInfo || !leagueInfo.isActive) {
      this.logger.warn(`getTopScorers: unknown or inactive league ${leagueId}`)
      return []
    }

    const targetSeason = season ?? this.getSeasonYear(leagueId)
    const safeLimit = Math.min(Math.max(limit, 1), 50)
    const cacheKey = `api-football:top-scorers:${leagueId}:${targetSeason}:${safeLimit}`

    const cached = await this.redisCache.get<TopScorerRow[]>(cacheKey)
    if (cached != null) {
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/players/topscorers?league=${leagueInfo.apiId}&season=${targetSeason}`,
        { headers: { 'x-apisports-key': this.apiKey } }
      )

      if (!response.ok) {
        this.logger.error(`Top scorers API error: ${response.status}`)
        return []
      }

      const data = await response.json()
      const list = (data.response || []).slice(0, safeLimit)

      const rows: TopScorerRow[] = list.map((scorer: any, index: number) => {
        const st = scorer.statistics?.[0] || {}
        const team = st.team || {}
        const goals = st.goals || {}
        const games = st.games || {}
        return {
          rank: index + 1,
          playerId: scorer.player?.id ?? 0,
          playerName: scorer.player?.name || '',
          playerPhoto: scorer.player?.photo || undefined,
          nationality: scorer.player?.nationality || undefined,
          teamName: team.name || '',
          teamLogo: team.logo || undefined,
          teamId: team.id != null ? Number(team.id) : 0,
          goals: goals.total ?? 0,
          assists: goals.assists ?? 0,
          appearances: games.appearences ?? games.appearances ?? 0,
        }
      })

      await this.redisCache.set(cacheKey, rows, CACHE_TTL.STANDINGS)
      return rows
    } catch (error) {
      this.logger.error(`getTopScorers: ${error.message}`)
      return []
    }
  }

  /**
   * Resolve API-Football team id via /teams?league=&season=&search=
   */
  async findTeamApiIdInLeague(leagueId: string, search: string): Promise<number | null> {
    const leagueInfo = LEAGUE_MAP[leagueId]
    const q = search?.trim()
    if (!leagueInfo || !q) {
      return null
    }

    const targetSeason = this.getDefaultSeasonYear()
    const cacheKey = `api-football:team-lookup:${leagueId}:${targetSeason}:${q.toLowerCase().slice(0, 48)}`

    const cached = await this.redisCache.get<number>(cacheKey)
    if (cached !== undefined && cached !== null) {
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      const url = `${this.baseUrl}/teams?league=${leagueInfo.apiId}&season=${targetSeason}&search=${encodeURIComponent(q)}`
      const response = await fetch(url, {
        headers: { 'x-apisports-key': this.apiKey },
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      const first = data.response?.[0]?.team
      const id = first?.id != null ? Number(first.id) : null

      if (id) {
        await this.redisCache.set(cacheKey, id, CACHE_TTL.STANDINGS)
      }

      return id
    } catch (error) {
      this.logger.error(`findTeamApiIdInLeague: ${error.message}`)
      return null
    }
  }

  /**
   * Full squad for a team (API-Football /players/squads).
   */
  async getTeamSquad(teamApiId: number): Promise<TeamSquadRow | null> {
    if (!teamApiId) {
      return null
    }

    const cacheKey = `api-football:squad:${teamApiId}`
    const cached = await this.redisCache.get<TeamSquadRow>(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/players/squads?team=${teamApiId}`,
        { headers: { 'x-apisports-key': this.apiKey } }
      )

      if (!response.ok) {
        this.logger.error(`Squad API error: ${response.status}`)
        return null
      }

      const data = await response.json()
      const block = data.response?.[0]
      if (!block) {
        return null
      }

      const team = block.team || {}
      const players = (block.players || []).map((pl: any) => ({
        id: pl.id,
        name: pl.name || '',
        photo: pl.photo || undefined,
        position: pl.position || undefined,
        number: pl.number != null ? Number(pl.number) : undefined,
        age: pl.age != null ? Number(pl.age) : undefined,
      }))

      const result: TeamSquadRow = {
        teamId: Number(team.id),
        teamName: team.name || '',
        teamLogo: team.logo || undefined,
        players,
      }

      await this.redisCache.set(cacheKey, result, 21_600)
      return result
    } catch (error) {
      this.logger.error(`getTeamSquad: ${error.message}`)
      return null
    }
  }

  /**
   * Get list of available leagues with full metadata
   * Returns only active leagues, sorted by display order
   */
  getAvailableLeagues(): Array<{
    id: string
    name: { es: string; en: string }
    shortName: { es: string; en: string }
    slug: { es: string; en: string }
    type: string
    apiId: number
    country: string | null
    confederation: string | null
    logoUrl: string
    order: number
    isActive: boolean
    status: string
    season: string | null
    startDate: string | null
    endDate: string | null
    color: string
    colorSecondary: string | null
    features: string[]
    metadata: { teams?: number; matches?: number; groups?: number; venues?: number } | null
  }> {
    return Object.entries(LEAGUE_MAP)
      .filter(([_, info]) => info.isActive) // Only return active leagues
      .map(([id, info]) => ({
        id,
        name: info.name,
        shortName: info.shortName,
        slug: info.slug,
        type: info.type,
        apiId: info.apiId,
        country: info.country,
        confederation: info.confederation,
        logoUrl: `https://media.api-sports.io/football/leagues/${info.apiId}.png`,
        order: info.order,
        isActive: info.isActive,
        status: info.status,
        season: info.season,
        startDate: info.startDate,
        endDate: info.endDate,
        color: info.color,
        colorSecondary: info.colorSecondary,
        features: info.features,
        metadata: info.metadata,
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
