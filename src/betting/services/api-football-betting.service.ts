import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisCacheService } from '../../common/redis-cache.service'

/**
 * Cache TTL constants (in seconds)
 */
const CACHE_TTL = {
  TEAM_STATS: 1800, // 30 minutes - stats don't change frequently
  H2H: 3600, // 1 hour - historical data
  FIXTURES: 300, // 5 minutes
  ODDS: 120, // 2 minutes - odds change frequently
  FIXTURE_STATS: 1800, // 30 minutes - post-match stats
}

/**
 * Data quality indicator for stats
 */
export interface DataQuality {
  form_goals_1h: 'real' | 'estimated'
  corners: 'real' | 'league_average'
  fouls: 'real' | 'estimated'
}

/**
 * Team statistics for betting analysis
 * Maps to variables needed by scoring algorithms
 */
export interface BettingTeamStats {
  teamId: number
  teamName: string
  leagueId: number
  season: number
  gamesPlayed: number

  // Goals first half
  over05_1h_pct: number // % matches with Over 0.5 1H
  over15_1h_pct: number // % matches with Over 1.5 1H
  avg_goals_1h: number // avg goals scored in 1H
  avg_conceded_1h: number // avg goals conceded in 1H
  bts_1h_pct: number // % matches with BTS in 1H

  // Home/Away splits
  home_over05_1h: number
  away_over05_1h: number
  home_avg_goals_1h: number
  away_avg_goals_1h: number

  // Corners
  avg_corners_for: number
  avg_corners_against: number
  avg_corners_total: number
  home_corners_total: number
  away_corners_total: number

  // Other stats for context
  avg_shots: number
  avg_shots_on_target: number
  avg_possession: number
  avg_fouls: number

  // Form (last 5 matches)
  form_goals_1h: number // how many of last 5 had goal in 1H
  form_corners_5: number // avg corners in last 5

  // Clean sheets / scoring streaks
  clean_sheets_pct: number
  failed_to_score_pct: number

  // Data quality indicators
  dataQuality?: DataQuality
}

/**
 * Head-to-head data
 */
export interface BettingH2H {
  teamAId: number
  teamBId: number
  matches: number
  last_5_goals_1h: number // of last 5 H2H, how many had goal in 1H
  avg_goals_1h: number // avg goals 1H in last 5 H2H
  avg_corners: number // avg corners in last 5 H2H
  over95_corners_count: number // of last 5, how many had Over 9.5 corners
  avg_total_goals: number
}

/**
 * Fixture data
 */
export interface BettingFixture {
  fixtureId: number
  date: Date
  kickoff: string // ISO string
  leagueId: number
  leagueName: string
  round: string
  homeTeamId: number
  homeTeamName: string
  awayTeamId: number
  awayTeamName: string
  venue: string
  city: string
  status: string
  // Score data (available for completed fixtures)
  homeGoals?: number
  awayGoals?: number
  homeGoals1H?: number
  awayGoals1H?: number
}

/**
 * Odds data from API-Football
 */
export interface BettingOdds {
  fixtureId: number
  bookmakers: BookmakerOdds[]
  updatedAt: Date
}

export interface BookmakerOdds {
  bookmakerId: number
  bookmakerName: string
  markets: MarketOdds[]
}

export interface MarketOdds {
  marketName: string
  values: OddsValue[]
}

export interface OddsValue {
  name: string // "Over 0.5", "Under 0.5", etc.
  odds: number
}

/**
 * Post-match fixture statistics
 */
export interface FixtureStats {
  fixtureId: number
  homeTeamId: number
  awayTeamId: number
  // Match status
  status: string // FT, HT, 1H, 2H, NS, etc.
  // Score
  homeGoals: number
  awayGoals: number
  homeGoals1H: number
  awayGoals1H: number
  // Stats
  homeCorners: number
  awayCorners: number
  homeShots: number
  awayShots: number
  homePossession: number
  awayPossession: number
}

@Injectable()
export class ApiFootballBettingService {
  private readonly logger = new Logger(ApiFootballBettingService.name)
  private readonly apiKey: string
  private readonly baseUrl = 'https://v3.football.api-sports.io'

  constructor(
    private readonly configService: ConfigService,
    private readonly redisCache: RedisCacheService
  ) {
    this.apiKey = this.configService.get<string>('API_FOOTBALL_KEY') || ''
    if (!this.apiKey) {
      this.logger.warn('API_FOOTBALL_KEY not configured for betting service')
    }
  }

  /**
   * Get fixtures for a specific date and league
   */
  async getFixtures(
    date: string,
    leagueId: number,
    season: string = '2025'
  ): Promise<BettingFixture[]> {
    const cacheKey = `betting:fixtures:${date}:${leagueId}`

    const cached = await this.redisCache.get<BettingFixture[]>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for fixtures ${date} league ${leagueId}`)
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/fixtures?date=${date}&league=${leagueId}&season=${season}`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        this.logger.error(`API error ${response.status} getting fixtures`)
        return []
      }

      const data = await response.json()
      const fixtures: BettingFixture[] = (data.response || []).map(
        (f: any) => ({
          fixtureId: f.fixture.id,
          date: new Date(f.fixture.date),
          kickoff: f.fixture.date,
          leagueId: f.league.id,
          leagueName: f.league.name,
          round: f.league.round || '',
          homeTeamId: f.teams.home.id,
          homeTeamName: f.teams.home.name,
          awayTeamId: f.teams.away.id,
          awayTeamName: f.teams.away.name,
          venue: f.fixture.venue?.name || '',
          city: f.fixture.venue?.city || '',
          status: f.fixture.status.short,
          // Score data (available for completed fixtures)
          homeGoals: f.goals?.home,
          awayGoals: f.goals?.away,
          homeGoals1H: f.score?.halftime?.home,
          awayGoals1H: f.score?.halftime?.away,
        })
      )

      await this.redisCache.set(cacheKey, fixtures, CACHE_TTL.FIXTURES)
      this.logger.log(
        `Fetched ${fixtures.length} fixtures for ${date} league ${leagueId}`
      )

      return fixtures
    } catch (error) {
      this.logger.error(`Error fetching fixtures: ${error.message}`)
      return []
    }
  }

  /**
   * Get fixtures for a specific LOCAL date accounting for UTC timezone issues
   *
   * API-Football stores fixtures in UTC, so evening matches (e.g., 7 PM local)
   * appear as the next day in UTC. This method:
   * 1. Queries both the target date AND the next day (UTC)
   * 2. Filters to only include fixtures that fall on the target date in user's timezone
   *
   * @param localDate - Target date in YYYY-MM-DD format (user's local date)
   * @param leagueId - League ID
   * @param season - Season year
   * @param timezone - User's timezone (e.g., 'America/El_Salvador')
   */
  async getFixturesForLocalDate(
    localDate: string,
    leagueId: number,
    season: string = '2025',
    timezone: string = 'America/El_Salvador'
  ): Promise<BettingFixture[]> {
    const cacheKey = `betting:fixtures:local:${localDate}:${leagueId}:${timezone}`

    const cached = await this.redisCache.get<BettingFixture[]>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for local fixtures ${localDate} league ${leagueId}`)
      return cached
    }

    // Calculate the next day to also query
    const targetDate = new Date(localDate + 'T00:00:00Z')
    const nextDate = new Date(targetDate)
    nextDate.setDate(nextDate.getDate() + 1)
    const nextDateStr = nextDate.toISOString().split('T')[0]

    this.logger.debug(
      `Querying fixtures for local date ${localDate} (timezone: ${timezone}): ` +
      `UTC dates ${localDate} and ${nextDateStr}`
    )

    // Fetch from both dates
    const [fixturesDay1, fixturesDay2] = await Promise.all([
      this.getFixtures(localDate, leagueId, season),
      this.getFixtures(nextDateStr, leagueId, season)
    ])

    // Combine and dedupe
    const allFixtures = [...fixturesDay1, ...fixturesDay2]
    const uniqueFixtures = allFixtures.filter(
      (f, idx, arr) => arr.findIndex(x => x.fixtureId === f.fixtureId) === idx
    )

    // Filter to only fixtures that fall on localDate in user's timezone
    const filtered = uniqueFixtures.filter(f => {
      const kickoffDate = new Date(f.kickoff)
      const localDateStr = this.getLocalDateString(kickoffDate, timezone)
      return localDateStr === localDate
    })

    this.logger.log(
      `Fetched ${filtered.length} fixtures for local date ${localDate} ` +
      `(from ${fixturesDay1.length} + ${fixturesDay2.length} UTC fixtures)`
    )

    await this.redisCache.set(cacheKey, filtered, CACHE_TTL.FIXTURES)
    return filtered
  }

  /**
   * Convert a UTC date to local date string (YYYY-MM-DD) in specified timezone
   */
  private getLocalDateString(utcDate: Date, timezone: string): string {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
    const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(utcDate)
    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    return `${year}-${month}-${day}`
  }

  /**
   * Get team statistics for betting analysis
   * Combines multiple API calls to build complete stats profile
   */
  async getTeamStats(
    leagueId: number,
    teamId: number,
    season?: number
  ): Promise<BettingTeamStats | null> {
    const targetSeason = season || this.getCurrentSeason()
    const cacheKey = `betting:team-stats:${leagueId}:${teamId}:${targetSeason}`

    const cached = await this.redisCache.get<BettingTeamStats>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for team stats ${teamId}`)
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      // Fetch team statistics from API-Football
      const response = await fetch(
        `${this.baseUrl}/teams/statistics?league=${leagueId}&team=${teamId}&season=${targetSeason}`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        this.logger.error(`API error ${response.status} getting team stats`)
        return null
      }

      const data = await response.json()
      const stats = data.response

      if (!stats) {
        this.logger.warn(`No stats found for team ${teamId}`)
        return null
      }

      // Extract and calculate betting-relevant stats
      const fixtures = stats.fixtures || {}
      const goals = stats.goals || {}
      const goalsFor = goals.for || {}
      const goalsAgainst = goals.against || {}

      const gamesPlayed =
        (fixtures.played?.home || 0) + (fixtures.played?.away || 0)

      // Calculate 1H goals stats from minute breakdown
      const goalsForMinute = goalsFor.minute || {}
      const goalsAgainstMinute = goalsAgainst.minute || {}

      const goals1HFor = this.sumGoalsFirstHalf(goalsForMinute)
      const goals1HAgainst = this.sumGoalsFirstHalf(goalsAgainstMinute)

      // Calculate averages
      const avgGoals1H = gamesPlayed > 0 ? goals1HFor / gamesPlayed : 0
      const avgConceded1H = gamesPlayed > 0 ? goals1HAgainst / gamesPlayed : 0

      // Over 0.5 1H estimation: use scoring rate
      // If team scores 0.8 goals in 1H on avg, they have ~80% chance of scoring
      const over05_1h_pct = Math.min(0.95, avgGoals1H + avgConceded1H > 0 ? 0.5 + avgGoals1H * 0.3 : 0.5)

      // Corners and other stats need fixture-level data
      // For now, use league averages as fallback
      const avgCorners = this.getLeagueAvgCorners(leagueId)

      // Fetch recent form data (actual goals in 1H from last 10 matches across ALL competitions)
      const recentForm = await this.getTeamRecentForm(teamId, 10)
      const formDataIsReal = recentForm.totalMatches >= 3

      // FALLBACK: If league-specific gamesPlayed is 0, use recentForm data
      // This handles national teams that play across multiple competitions
      // (Friendlies, World Cup Qualifiers, Nations League, etc.)
      const effectiveGamesPlayed = gamesPlayed > 0 ? gamesPlayed : recentForm.totalMatches

      if (gamesPlayed === 0 && recentForm.totalMatches > 0) {
        this.logger.debug(
          `Team ${teamId}: Using cross-competition data (${recentForm.totalMatches} matches from all competitions)`
        )
      }

      // Determine data quality
      const dataQuality: DataQuality = {
        form_goals_1h: formDataIsReal ? 'real' : 'estimated',
        corners: 'league_average', // API doesn't provide corner stats per team
        fouls: 'estimated', // API doesn't provide fouls breakdown
      }

      // Log when using estimated data
      if (!formDataIsReal) {
        this.logger.warn(
          `Team ${teamId}: Using estimated form_goals_1h (only ${recentForm.totalMatches} matches found)`
        )
      }

      const result: BettingTeamStats = {
        teamId,
        teamName: stats.team?.name || '',
        leagueId,
        season: targetSeason,
        gamesPlayed: effectiveGamesPlayed,

        // 1H Goals
        over05_1h_pct,
        over15_1h_pct: Math.max(0, over05_1h_pct - 0.35), // rough estimation
        avg_goals_1h: avgGoals1H,
        avg_conceded_1h: avgConceded1H,
        bts_1h_pct: Math.min(0.4, avgGoals1H * avgConceded1H), // rough estimation

        // Home/Away
        home_over05_1h: over05_1h_pct + 0.05, // home advantage
        away_over05_1h: over05_1h_pct - 0.05,
        home_avg_goals_1h: avgGoals1H * 1.1,
        away_avg_goals_1h: avgGoals1H * 0.9,

        // Corners (using league averages - API doesn't provide team-level corner stats)
        avg_corners_for: avgCorners / 2,
        avg_corners_against: avgCorners / 2,
        avg_corners_total: avgCorners,
        home_corners_total: avgCorners * 1.05,
        away_corners_total: avgCorners * 0.95,

        // Other stats
        avg_shots: this.extractAvgShots(stats),
        avg_shots_on_target: this.extractAvgShotsOnTarget(stats),
        avg_possession: this.extractAvgPossession(stats),
        avg_fouls: 12, // estimated - API doesn't provide fouls per team

        // Form (real data from last 10 fixtures when available)
        form_goals_1h: formDataIsReal
          ? recentForm.matchesWithGoal1H
          : Math.round(effectiveGamesPlayed > 0 ? Math.min(10, effectiveGamesPlayed * over05_1h_pct) : 3),
        form_corners_5: avgCorners,

        // Clean sheets
        clean_sheets_pct: (stats.clean_sheet?.total || 0) / Math.max(1, effectiveGamesPlayed),
        failed_to_score_pct: (stats.failed_to_score?.total || 0) / Math.max(1, effectiveGamesPlayed),

        // Data quality indicators
        dataQuality,
      }

      await this.redisCache.set(cacheKey, result, CACHE_TTL.TEAM_STATS)
      this.logger.log(`Fetched stats for team ${teamId} in league ${leagueId}`)

      return result
    } catch (error) {
      this.logger.error(`Error fetching team stats: ${error.message}`)
      return null
    }
  }

  /**
   * Get head-to-head data between two teams
   */
  async getH2H(
    teamAId: number,
    teamBId: number,
    last: number = 5
  ): Promise<BettingH2H | null> {
    const cacheKey = `betting:h2h:${teamAId}:${teamBId}:${last}`

    const cached = await this.redisCache.get<BettingH2H>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for H2H ${teamAId} vs ${teamBId}`)
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/fixtures/headtohead?h2h=${teamAId}-${teamBId}&last=${last}`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        this.logger.error(`API error ${response.status} getting H2H`)
        return null
      }

      const data = await response.json()
      const matches = data.response || []

      if (matches.length === 0) {
        return {
          teamAId,
          teamBId,
          matches: 0,
          last_5_goals_1h: 0,
          avg_goals_1h: 0,
          avg_corners: 0,
          over95_corners_count: 0,
          avg_total_goals: 0,
        }
      }

      // Calculate H2H stats
      let goalsIn1H = 0
      let totalGoals1H = 0
      let totalCorners = 0
      let over95Corners = 0
      let totalGoals = 0

      for (const match of matches) {
        const homeGoals = match.goals?.home || 0
        const awayGoals = match.goals?.away || 0
        const homeHT = match.score?.halftime?.home || 0
        const awayHT = match.score?.halftime?.away || 0

        totalGoals += homeGoals + awayGoals
        totalGoals1H += homeHT + awayHT

        if (homeHT + awayHT > 0) {
          goalsIn1H++
        }

        // Corners would need fixture stats endpoint
        // Using estimate based on total goals correlation
        const estimatedCorners = 8 + (homeGoals + awayGoals) * 1.5
        totalCorners += estimatedCorners
        if (estimatedCorners >= 10) {
          over95Corners++
        }
      }

      const result: BettingH2H = {
        teamAId,
        teamBId,
        matches: matches.length,
        last_5_goals_1h: goalsIn1H,
        avg_goals_1h: totalGoals1H / matches.length,
        avg_corners: totalCorners / matches.length,
        over95_corners_count: over95Corners,
        avg_total_goals: totalGoals / matches.length,
      }

      await this.redisCache.set(cacheKey, result, CACHE_TTL.H2H)
      this.logger.log(`Fetched H2H: ${teamAId} vs ${teamBId} (${matches.length} matches)`)

      return result
    } catch (error) {
      this.logger.error(`Error fetching H2H: ${error.message}`)
      return null
    }
  }

  /**
   * Get odds for a fixture from API-Football
   */
  async getOdds(fixtureId: number): Promise<BettingOdds | null> {
    const cacheKey = `betting:odds:${fixtureId}`

    const cached = await this.redisCache.get<BettingOdds>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for odds fixture ${fixtureId}`)
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/odds?fixture=${fixtureId}`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        this.logger.error(`API error ${response.status} getting odds`)
        return null
      }

      const data = await response.json()
      const oddsData = data.response?.[0]

      if (!oddsData) {
        return null
      }

      const bookmakers: BookmakerOdds[] = (oddsData.bookmakers || []).map(
        (bk: any) => ({
          bookmakerId: bk.id,
          bookmakerName: bk.name,
          markets: (bk.bets || []).map((bet: any) => ({
            marketName: bet.name,
            values: (bet.values || []).map((v: any) => ({
              name: v.value,
              odds: parseFloat(v.odd),
            })),
          })),
        })
      )

      const result: BettingOdds = {
        fixtureId,
        bookmakers,
        updatedAt: new Date(),
      }

      await this.redisCache.set(cacheKey, result, CACHE_TTL.ODDS)
      this.logger.log(`Fetched odds for fixture ${fixtureId}`)

      return result
    } catch (error) {
      this.logger.error(`Error fetching odds: ${error.message}`)
      return null
    }
  }

  /**
   * Get post-match statistics for a fixture
   */
  async getFixtureStats(fixtureId: number): Promise<FixtureStats | null> {
    const cacheKey = `betting:fixture-stats:${fixtureId}`

    const cached = await this.redisCache.get<FixtureStats>(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return null
    }

    try {
      // Fetch fixture and statistics in parallel
      const [fixtureRes, statsRes] = await Promise.all([
        fetch(`${this.baseUrl}/fixtures?id=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
        fetch(`${this.baseUrl}/fixtures/statistics?fixture=${fixtureId}`, {
          headers: { 'x-apisports-key': this.apiKey },
        }),
      ])

      const [fixtureData, statsData] = await Promise.all([
        fixtureRes.json(),
        statsRes.json(),
      ])

      const fixture = fixtureData.response?.[0]
      const stats = statsData.response || []

      if (!fixture) {
        return null
      }

      const homeStats = stats[0]?.statistics || []
      const awayStats = stats[1]?.statistics || []

      const findStat = (arr: any[], type: string): number => {
        const stat = arr.find((s: any) => s.type === type)
        if (!stat?.value) return 0
        if (typeof stat.value === 'string') {
          return parseInt(stat.value.replace('%', ''), 10) || 0
        }
        return stat.value
      }

      const result: FixtureStats = {
        fixtureId,
        homeTeamId: fixture.teams.home.id,
        awayTeamId: fixture.teams.away.id,
        status: fixture.fixture?.status?.short || 'NS',
        homeGoals: fixture.goals?.home || 0,
        awayGoals: fixture.goals?.away || 0,
        homeGoals1H: fixture.score?.halftime?.home || 0,
        awayGoals1H: fixture.score?.halftime?.away || 0,
        homeCorners: findStat(homeStats, 'Corner Kicks'),
        awayCorners: findStat(awayStats, 'Corner Kicks'),
        homeShots: findStat(homeStats, 'Total Shots'),
        awayShots: findStat(awayStats, 'Total Shots'),
        homePossession: findStat(homeStats, 'Ball Possession'),
        awayPossession: findStat(awayStats, 'Ball Possession'),
      }

      await this.redisCache.set(cacheKey, result, CACHE_TTL.FIXTURE_STATS)
      return result
    } catch (error) {
      this.logger.error(`Error fetching fixture stats: ${error.message}`)
      return null
    }
  }

  /**
   * Get closing odds for CLV calculation
   */
  async getClosingOdds(fixtureId: number): Promise<BettingOdds | null> {
    // Same as getOdds but called post-match
    // Cache with longer TTL since closing odds don't change
    const cacheKey = `betting:closing-odds:${fixtureId}`

    const cached = await this.redisCache.get<BettingOdds>(cacheKey)
    if (cached) {
      return cached
    }

    const odds = await this.getOdds(fixtureId)
    if (odds) {
      // Cache closing odds for 24 hours
      await this.redisCache.set(cacheKey, odds, 86400)
    }

    return odds
  }

  // ============ Helper Methods ============

  /**
   * Get team's recent form by fetching last N fixtures
   * Returns actual goals in 1H stats from real match data
   */
  async getTeamRecentForm(
    teamId: number,
    last: number = 5
  ): Promise<{
    matchesWithGoal1H: number
    avgGoals1H: number
    avgCorners: number
    totalMatches: number
  }> {
    const cacheKey = `betting:team-form:${teamId}:${last}`

    const cached = await this.redisCache.get<{
      matchesWithGoal1H: number
      avgGoals1H: number
      avgCorners: number
      totalMatches: number
    }>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/fixtures?team=${teamId}&last=${last}&status=FT`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        this.logger.warn(`API error ${response.status} getting team form`)
        return {
          matchesWithGoal1H: 3, // fallback
          avgGoals1H: 0.8,
          avgCorners: 5,
          totalMatches: 0,
        }
      }

      const data = await response.json()
      const matches = data.response || []

      let matchesWithGoal1H = 0
      let totalGoals1H = 0

      for (const match of matches) {
        const homeHT = match.score?.halftime?.home || 0
        const awayHT = match.score?.halftime?.away || 0
        const total1H = homeHT + awayHT

        if (total1H > 0) {
          matchesWithGoal1H++
        }
        totalGoals1H += total1H
      }

      const result = {
        matchesWithGoal1H,
        avgGoals1H: matches.length > 0 ? totalGoals1H / matches.length : 0.8,
        avgCorners: 5, // Still estimated - would need fixture stats endpoint
        totalMatches: matches.length,
      }

      await this.redisCache.set(cacheKey, result, CACHE_TTL.TEAM_STATS)
      this.logger.debug(
        `Team ${teamId} form: ${matchesWithGoal1H}/${matches.length} matches with goal in 1H`
      )

      return result
    } catch (error) {
      this.logger.error(`Error fetching team form: ${error.message}`)
      return {
        matchesWithGoal1H: 3,
        avgGoals1H: 0.8,
        avgCorners: 5,
        totalMatches: 0,
      }
    }
  }

  private getCurrentSeason(): number {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    // European leagues: Aug-May, so Jan-Jul = previous year's season
    return currentMonth <= 7 ? currentYear - 1 : currentYear
  }

  private sumGoalsFirstHalf(minuteBreakdown: any): number {
    let total = 0
    const firstHalfRanges = ['0-15', '16-30', '31-45', '46-60']

    for (const range of firstHalfRanges) {
      if (minuteBreakdown[range]) {
        total += minuteBreakdown[range].total || 0
      }
    }

    // Also check individual minutes if available
    if (minuteBreakdown['45+']) {
      total += minuteBreakdown['45+'].total || 0
    }

    return total
  }

  private getLeagueAvgCorners(leagueId: number): number {
    // League average corners per match (empirical data)
    const leagueCorners: Record<number, number> = {
      39: 10.2, // Premier League
      140: 9.8, // La Liga
      135: 10.5, // Serie A
      78: 10.0, // Bundesliga
      61: 9.5, // Ligue 1
      88: 10.8, // Eredivisie
      94: 10.3, // Primeira Liga
      262: 9.0, // Liga MX
      253: 9.2, // MLS
    }

    return leagueCorners[leagueId] || 10.0
  }

  private extractAvgShots(stats: any): number {
    const total = stats.shots?.total || 0
    const games = stats.fixtures?.played?.total || 1
    return total / games
  }

  private extractAvgShotsOnTarget(stats: any): number {
    const onTarget = stats.shots?.on || 0
    const games = stats.fixtures?.played?.total || 1
    return onTarget / games
  }

  private extractAvgPossession(stats: any): number {
    // API-Football returns possession as percentage string like "54%"
    const possession = stats.lineups?.[0]?.statistics?.find(
      (s: any) => s.type === 'Ball Possession'
    )?.value
    if (possession && typeof possession === 'string') {
      return parseInt(possession.replace('%', ''), 10) || 50
    }
    return 50
  }

  /**
   * Search leagues by name
   */
  async searchLeagues(name: string): Promise<Array<{
    id: number
    name: string
    country: string
    type: string
    logo: string
  }>> {
    try {
      const response = await fetch(
        `${this.baseUrl}/leagues?search=${encodeURIComponent(name)}`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (!data?.response) {
        return []
      }

      return data.response.map((item: any) => ({
        id: item.league?.id,
        name: item.league?.name || 'Unknown',
        country: item.country?.name || 'International',
        type: item.league?.type || 'League',
        logo: item.league?.logo || '',
      }))
    } catch (error) {
      this.logger.error(`Failed to search leagues: ${error}`)
      return []
    }
  }

  /**
   * Get basic league information
   * Used to add new leagues to the system
   */
  async getLeagueInfo(leagueId: number): Promise<{
    id: number
    name: string
    country: string
    logo: string
    type: string
  } | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/leagues?id=${leagueId}`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (!data?.response?.[0]) {
        return null
      }

      const leagueData = data.response[0]
      return {
        id: leagueData.league?.id,
        name: leagueData.league?.name || 'Unknown',
        country: leagueData.country?.name || 'International',
        logo: leagueData.league?.logo || '',
        type: leagueData.league?.type || 'League',
      }
    } catch (error) {
      this.logger.error(
        `Failed to get league info for ${leagueId}: ${error}`
      )
      return null
    }
  }

  /**
   * Get league season information
   * Used by league-sync cron to detect active seasons
   */
  async getLeagueSeasonInfo(leagueId: number): Promise<{
    season: number
    seasonStart: string | null
    seasonEnd: string | null
    coverage: {
      fixtures: {
        events: boolean
        lineups: boolean
        statistics_fixtures: boolean
        statistics_players: boolean
      }
      standings: boolean
      players: boolean
      top_scorers: boolean
      predictions: boolean
      odds: boolean
    } | null
  } | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/leagues?id=${leagueId}&current=true`,
        {
          headers: { 'x-apisports-key': this.apiKey },
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (!data?.response?.[0]) {
        return null
      }

      const leagueData = data.response[0]
      const seasons = leagueData.seasons || []
      const currentSeason = seasons.find((s: any) => s.current === true)

      if (!currentSeason) {
        return null
      }

      return {
        season: currentSeason.year,
        seasonStart: currentSeason.start || null,
        seasonEnd: currentSeason.end || null,
        coverage: currentSeason.coverage || null,
      }
    } catch (error) {
      this.logger.error(
        `Failed to get season info for league ${leagueId}: ${error}`
      )
      return null
    }
  }

  /**
   * Get API quota status from API-Football /status endpoint
   * Returns subscription and request quota information
   */
  async getQuotaStatus(): Promise<{
    account: string
    subscription: {
      plan: string
      end: string
      active: boolean
    }
    requests: {
      current: number
      limit_day: number
    }
    error?: string
  } | null> {
    if (!this.apiKey) {
      return null
    }

    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        headers: { 'x-apisports-key': this.apiKey },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      // Check for API errors
      if (data.errors && Object.keys(data.errors).length > 0) {
        const errorMsg = Object.values(data.errors).join(', ')
        return {
          account: 'unknown',
          subscription: {
            plan: 'unknown',
            end: 'unknown',
            active: false,
          },
          requests: {
            current: 0,
            limit_day: 0,
          },
          error: errorMsg,
        }
      }

      const status = data.response
      if (!status) {
        throw new Error('Invalid response structure')
      }

      return {
        account: status.account?.email || 'unknown',
        subscription: {
          plan: status.subscription?.plan || 'unknown',
          end: status.subscription?.end || 'unknown',
          active: status.subscription?.active ?? false,
        },
        requests: {
          current: status.requests?.current ?? 0,
          limit_day: status.requests?.limit_day ?? 0,
        },
      }
    } catch (error) {
      this.logger.error(`Failed to get API quota status: ${error}`)
      return null
    }
  }
}
