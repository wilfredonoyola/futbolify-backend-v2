import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { FhgMatch, FhgMatchDocument } from '../schemas/fhg-match.schema'
import { FhgTeam, FhgTeamDocument } from '../schemas/fhg-team.schema'
import { FhgOdds, FhgOddsDocument } from '../schemas/fhg-odds.schema'
import { FhgLogService } from './fhg-log.service'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'
import { getActiveFhgLeagues, FhgLeagueConfig } from '../constants/fhg-config'
import { RefreshResultDto } from '../dto/fhg-pipeline-result.dto'
import { OddsApiService, FirstHalfOdds } from '../odds-api.service'

/**
 * Get current season based on month
 */
function getCurrentSeason(): number {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return month < 8 ? year - 1 : year
}

/**
 * FHG Data Service
 * Handles importing matches, team stats, and odds from external APIs
 */
@Injectable()
export class FhgDataService {
  private readonly logger = new Logger(FhgDataService.name)
  private readonly apiKey: string
  private readonly baseUrl = 'https://v3.football.api-sports.io'

  constructor(
    @InjectModel(FhgMatch.name)
    private matchModel: Model<FhgMatchDocument>,
    @InjectModel(FhgTeam.name)
    private teamModel: Model<FhgTeamDocument>,
    @InjectModel(FhgOdds.name)
    private oddsModel: Model<FhgOddsDocument>,
    private configService: ConfigService,
    private logService: FhgLogService,
    private oddsApiService: OddsApiService
  ) {
    this.apiKey = this.configService.get<string>('API_FOOTBALL_KEY') || ''
  }

  /**
   * Import matches for a date range (default: today + 7 days)
   * @param date Start date (YYYY-MM-DD), defaults to today
   * @param daysAhead Number of days to look ahead (default 7)
   */
  async importMatches(date?: string, daysAhead = 7): Promise<RefreshResultDto> {
    const targetDate = date ? new Date(date) : new Date()
    const dateStr = targetDate.toISOString().split('T')[0]

    const endDate = new Date(targetDate)
    endDate.setDate(endDate.getDate() + daysAhead)
    const endDateStr = endDate.toISOString().split('T')[0]

    await this.logService.info(
      FhgLogCategory.PIPELINE,
      `Starting match import: ${dateStr} to ${endDateStr} (${daysAhead} days)`
    )

    if (!this.apiKey) {
      const errorMsg = '❌ API_FOOTBALL_KEY not configured. Add it to your .env file.'
      await this.logService.error(FhgLogCategory.PIPELINE, errorMsg)
      return {
        updated: 0,
        created: 0,
        failed: 0,
        success: false,
        error: errorMsg,
      }
    }

    const activeLeagues = getActiveFhgLeagues()
    let created = 0
    let updated = 0
    let failed = 0

    let rateLimitHit = false
    let lastError: string | undefined

    for (const league of activeLeagues) {
      // Stop if we hit rate limit
      if (rateLimitHit) {
        await this.logService.warn(
          FhgLogCategory.PIPELINE,
          `Skipping ${league.name} due to rate limit`
        )
        continue
      }

      try {
        const result = await this.importMatchesForLeague(league, targetDate, endDate)
        created += result.created
        updated += result.updated
        failed += result.failed

        if (result.created > 0 || result.updated > 0) {
          await this.logService.info(
            FhgLogCategory.PIPELINE,
            `${league.name}: ${result.created} created, ${result.updated} updated`
          )
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        lastError = errorMsg

        // Check if it's a rate limit error
        if (errorMsg.includes('request limit') || errorMsg.includes('rate limit')) {
          rateLimitHit = true
          await this.logService.error(
            FhgLogCategory.PIPELINE,
            `⚠️ RATE LIMIT: API-Football daily limit reached. Try again tomorrow.`,
            { league: league.code }
          )
        } else {
          await this.logService.error(
            FhgLogCategory.PIPELINE,
            `Failed to import ${league.name}: ${errorMsg}`
          )
        }
        failed++
      }
    }

    const successMsg = `Match import completed: ${created} created, ${updated} updated, ${failed} failed`

    if (rateLimitHit) {
      await this.logService.warn(
        FhgLogCategory.PIPELINE,
        `${successMsg} (stopped due to rate limit)`
      )
    } else {
      await this.logService.info(FhgLogCategory.PIPELINE, successMsg)
    }

    return {
      created,
      updated,
      failed,
      success: failed === 0 && !rateLimitHit,
      error: rateLimitHit
        ? 'API-Football: Daily request limit reached. Try again tomorrow or upgrade your plan.'
        : lastError,
    }
  }

  /**
   * Import matches for a specific league within a date range
   */
  private async importMatchesForLeague(
    league: FhgLeagueConfig,
    fromDate: Date,
    toDate: Date
  ): Promise<{ created: number; updated: number; failed: number }> {
    if (!league.apiFootballId) {
      this.logger.warn(`No API Football ID for league ${league.code}`)
      return { created: 0, updated: 0, failed: 0 }
    }

    const season = getCurrentSeason()
    const fromDateStr = fromDate.toISOString().split('T')[0]
    const toDateStr = toDate.toISOString().split('T')[0]

    const url = `${this.baseUrl}/fixtures?league=${league.apiFootballId}&season=${season}&from=${fromDateStr}&to=${toDateStr}`

    await this.logService.debug(
      FhgLogCategory.PIPELINE,
      `Fetching fixtures: ${url}`,
      { league: league.code }
    )

    const response = await fetch(url, {
      headers: { 'x-apisports-key': this.apiKey },
    })

    if (!response.ok) {
      await this.logService.error(
        FhgLogCategory.PIPELINE,
        `API HTTP error ${response.status} for ${league.name}`,
        { league: league.code, status: response.status }
      )
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()

    // Check for API errors (rate limits, invalid key, etc.)
    if (data.errors && Object.keys(data.errors).length > 0) {
      const errorMsg = Object.values(data.errors).join(', ')
      await this.logService.error(
        FhgLogCategory.PIPELINE,
        `API-Football error: ${errorMsg}`,
        { league: league.code, errors: data.errors }
      )
      throw new Error(`API-Football: ${errorMsg}`)
    }

    const fixtures = data.response || []

    await this.logService.info(
      FhgLogCategory.PIPELINE,
      `Found ${fixtures.length} fixtures for ${league.name}`,
      { league: league.code, count: fixtures.length }
    )

    let created = 0
    let updated = 0
    let failed = 0

    for (const fixture of fixtures) {
      try {
        const matchDate = new Date(fixture.fixture.date)
        const apiFootballId = fixture.fixture.id.toString()

        // Check if match already exists
        const existing = await this.matchModel.findOne({ apiFootballId })

        const matchData = {
          leagueCode: league.code,
          apiFootballId,
          homeTeam: fixture.teams.home.name,
          awayTeam: fixture.teams.away.name,
          date: matchDate,
          kickoffTime: matchDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          status: this.mapFixtureStatus(fixture.fixture.status.short),
          homeScore1H: fixture.score?.halftime?.home ?? null,
          awayScore1H: fixture.score?.halftime?.away ?? null,
          homeScoreFT: fixture.goals?.home ?? null,
          awayScoreFT: fixture.goals?.away ?? null,
          season: season.toString(),
        }

        if (existing) {
          await this.matchModel.updateOne(
            { _id: existing._id },
            { $set: matchData }
          )
          updated++
        } else {
          await this.matchModel.create(matchData)
          created++

          // Also import team stats for new matches
          await this.importTeamIfNotExists(
            fixture.teams.home.name,
            fixture.teams.home.id,
            league
          )
          await this.importTeamIfNotExists(
            fixture.teams.away.name,
            fixture.teams.away.id,
            league
          )
        }
      } catch (error) {
        this.logger.error(`Failed to import fixture: ${error}`)
        failed++
      }
    }

    return { created, updated, failed }
  }

  /**
   * Import team if it doesn't exist
   */
  private async importTeamIfNotExists(
    teamName: string,
    apiFootballId: number,
    league: FhgLeagueConfig
  ): Promise<void> {
    const season = getCurrentSeason().toString()
    const existing = await this.teamModel.findOne({
      leagueCode: league.code,
      name: teamName,
      season,
    })

    if (existing) return

    // Create basic team record
    await this.teamModel.create({
      name: teamName,
      leagueCode: league.code,
      apiFootballId,
      season,
      homeMatchesPlayed: 0,
      homeMatchesWithG1H: 0,
      homeG1HRate: league.avgG1H / 2, // Use league average as default
      homeGoalsScored1H: 0,
      homeGoalsConceded1H: 0,
      awayMatchesPlayed: 0,
      awayMatchesWithG1H: 0,
      awayG1HRate: league.avgG1H / 2,
      awayGoalsScored1H: 0,
      awayGoalsConceded1H: 0,
      totalMatchesPlayed: 0,
      overallG1HRate: league.avgG1H / 2,
      recentForm: [],
    })

    await this.logService.debug(
      FhgLogCategory.STATS,
      `Created team: ${teamName} (${league.code})`
    )
  }

  /**
   * Refresh team statistics from API-Football
   */
  async refreshTeamStats(leagueCode?: string): Promise<RefreshResultDto> {
    await this.logService.info(
      FhgLogCategory.STATS,
      `Refreshing team stats${leagueCode ? ` for ${leagueCode}` : ''}`
    )

    if (!this.apiKey) {
      return {
        updated: 0,
        created: 0,
        failed: 0,
        success: false,
        error: 'No API_FOOTBALL_KEY configured',
      }
    }

    const leagues = leagueCode
      ? getActiveFhgLeagues().filter((l) => l.code === leagueCode)
      : getActiveFhgLeagues()

    let updated = 0
    let failed = 0

    for (const league of leagues) {
      if (!league.apiFootballId) continue

      const teams = await this.teamModel.find({
        leagueCode: league.code,
        apiFootballId: { $exists: true, $ne: null },
      })

      for (const team of teams) {
        try {
          await this.updateTeamStats(team, league)
          updated++
        } catch (error) {
          this.logger.error(`Failed to update stats for ${team.name}: ${error}`)
          failed++
        }

        // Rate limiting - API-Football has limits
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    await this.logService.info(
      FhgLogCategory.STATS,
      `Team stats refresh completed: ${updated} updated, ${failed} failed`
    )

    return {
      updated,
      created: 0,
      failed,
      success: failed === 0,
    }
  }

  /**
   * Update stats for a single team
   */
  private async updateTeamStats(
    team: FhgTeamDocument,
    league: FhgLeagueConfig
  ): Promise<void> {
    const season = getCurrentSeason()
    const url = `${this.baseUrl}/teams/statistics?team=${team.apiFootballId}&league=${league.apiFootballId}&season=${season}`

    const response = await fetch(url, {
      headers: { 'x-apisports-key': this.apiKey },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const stats = data.response

    if (!stats) return

    // Calculate G1H stats from goals data
    const homeMatches = stats.fixtures?.played?.home || 0
    const awayMatches = stats.fixtures?.played?.away || 0
    const totalMatches = homeMatches + awayMatches

    // Use average goals as proxy for G1H rate (simplified)
    const avgGoalsFor = stats.goals?.for?.average?.total || 0
    const avgGoalsAgainst = stats.goals?.against?.average?.total || 0

    // Estimate G1H rate based on total goals (roughly 45% of goals in 1H)
    const estimatedG1HRate = Math.min(
      0.9,
      (avgGoalsFor * 0.45 + avgGoalsAgainst * 0.45) / 2
    )

    await this.teamModel.updateOne(
      { _id: team._id },
      {
        $set: {
          homeMatchesPlayed: homeMatches,
          awayMatchesPlayed: awayMatches,
          totalMatchesPlayed: totalMatches,
          homeG1HRate: estimatedG1HRate,
          awayG1HRate: estimatedG1HRate * 0.9, // Away slightly lower
          overallG1HRate: estimatedG1HRate,
          lastStatsUpdate: new Date(),
        },
      }
    )
  }

  /**
   * Import odds for matches using The Odds API (real odds)
   * Falls back to estimated odds when real data unavailable
   */
  async importOdds(matchId?: string): Promise<RefreshResultDto> {
    await this.logService.info(
      FhgLogCategory.ODDS,
      `Importing odds${matchId ? ` for match ${matchId}` : ' for all matches'}`
    )

    const activeLeagues = getActiveFhgLeagues()
    let created = 0
    let updated = 0
    let failed = 0

    // Fetch real odds from The Odds API for each league
    const realOddsMap = new Map<string, FirstHalfOdds[]>()

    for (const league of activeLeagues) {
      try {
        const leagueOdds = await this.oddsApiService.getFirstHalfOdds(league.code)
        if (leagueOdds.length > 0) {
          realOddsMap.set(league.code, leagueOdds)
          await this.logService.info(
            FhgLogCategory.ODDS,
            `Fetched ${leagueOdds.length} real G1H odds for ${league.name}`
          )
        }
      } catch (error) {
        await this.logService.warn(
          FhgLogCategory.ODDS,
          `Failed to fetch real odds for ${league.name}: ${error}`
        )
      }
    }

    // Get matches that need odds
    const query: Record<string, unknown> = { status: 'SCHEDULED' }
    if (matchId) {
      query._id = matchId
    }

    const matches = await this.matchModel.find(query).limit(100)

    for (const match of matches) {
      try {
        // Try to find real odds for this match
        const leagueOdds = realOddsMap.get(match.leagueCode) || []
        const realOdds = this.findMatchingOdds(match, leagueOdds)

        // Check if odds already exist
        const existingOdds = await this.oddsModel.findOne({ matchId: match._id })

        if (realOdds) {
          // We have real odds from The Odds API
          const oddsData = {
            matchId: match._id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            date: match.date,
            bookmakers: realOdds.bookmakers.map((b) => ({
              bookmaker: b.bookmaker,
              g1hYes: b.g1hYes,
              g1hNo: b.g1hNo,
              lastUpdate: new Date(),
            })),
            bestG1hYes: realOdds.bestG1hYes,
            bestG1hYesBookmaker: realOdds.bestG1hYesBookmaker || 'Unknown',
            bestG1hNo: realOdds.bestG1hNo,
            bestG1hNoBookmaker: realOdds.bestG1hNoBookmaker || 'Unknown',
            avgG1hYes: realOdds.avgG1hYes,
            avgG1hNo: realOdds.avgG1hNo,
            impliedProbG1hYes: realOdds.impliedProbG1hYes,
            isRealOdds: true,
            lastUpdate: new Date(),
          }

          if (existingOdds) {
            await this.oddsModel.updateOne({ _id: existingOdds._id }, { $set: oddsData })
            updated++
          } else {
            await this.oddsModel.create(oddsData)
            created++
          }
        } else {
          // No real odds, use estimated
          if (existingOdds && existingOdds.isRealOdds) {
            // Don't overwrite real odds with estimates
            updated++
            continue
          }

          const estimatedOdds = this.estimateOdds(match)
          const oddsData = {
            matchId: match._id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            date: match.date,
            bookmakers: [
              {
                bookmaker: 'Estimated',
                g1hYes: estimatedOdds.g1hYes,
                g1hNo: estimatedOdds.g1hNo,
                lastUpdate: new Date(),
              },
            ],
            bestG1hYes: estimatedOdds.g1hYes,
            bestG1hYesBookmaker: 'Estimated',
            bestG1hNo: estimatedOdds.g1hNo,
            bestG1hNoBookmaker: 'Estimated',
            avgG1hYes: estimatedOdds.g1hYes,
            avgG1hNo: estimatedOdds.g1hNo,
            impliedProbG1hYes: 1 / estimatedOdds.g1hYes,
            isRealOdds: false,
            lastUpdate: new Date(),
          }

          if (existingOdds) {
            await this.oddsModel.updateOne({ _id: existingOdds._id }, { $set: oddsData })
            updated++
          } else {
            await this.oddsModel.create(oddsData)
            created++
          }
        }
      } catch (error) {
        this.logger.error(`Failed to import odds for ${match.homeTeam} vs ${match.awayTeam}: ${error}`)
        failed++
      }
    }

    const realCount = Array.from(realOddsMap.values()).reduce((sum, arr) => sum + arr.length, 0)
    await this.logService.info(
      FhgLogCategory.ODDS,
      `Odds import completed: ${created} created, ${updated} updated, ${failed} failed (${realCount} real odds fetched)`,
      { created, updated, failed, realOddsFetched: realCount }
    )

    return {
      created,
      updated,
      failed,
      success: failed === 0,
    }
  }

  /**
   * Find matching odds for a match using fuzzy team name matching
   */
  private findMatchingOdds(
    match: FhgMatchDocument,
    leagueOdds: FirstHalfOdds[]
  ): FirstHalfOdds | null {
    const normalizedHome = this.normalizeTeamName(match.homeTeam)
    const normalizedAway = this.normalizeTeamName(match.awayTeam)

    for (const odds of leagueOdds) {
      const oddsHome = this.normalizeTeamName(odds.homeTeam)
      const oddsAway = this.normalizeTeamName(odds.awayTeam)

      // Check for exact match or similarity
      if (
        (this.teamNamesSimilar(normalizedHome, oddsHome) &&
          this.teamNamesSimilar(normalizedAway, oddsAway))
      ) {
        return odds
      }
    }

    return null
  }

  /**
   * Normalize team name for matching
   */
  private normalizeTeamName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/fc|sc|ac|as|afc|cf|fk|sk|bk|if|us|ss/gi, '')
      .replace(/[^a-z0-9]/g, '')
  }

  /**
   * Check if two team names are similar enough to be a match
   */
  private teamNamesSimilar(name1: string, name2: string): boolean {
    // Exact match
    if (name1 === name2) return true

    // One contains the other
    if (name1.includes(name2) || name2.includes(name1)) return true

    // Check if first 4+ characters match
    if (name1.length >= 4 && name2.length >= 4) {
      const prefix1 = name1.substring(0, 4)
      const prefix2 = name2.substring(0, 4)
      if (prefix1 === prefix2) return true
    }

    return false
  }

  /**
   * Estimate odds based on league average (placeholder)
   */
  private estimateOdds(match: FhgMatchDocument): { g1hYes: number; g1hNo: number } {
    // Get league config
    const leagues = getActiveFhgLeagues()
    const league = leagues.find((l) => l.code === match.leagueCode)
    const avgG1H = league?.avgG1H || 1.25

    // Convert avg goals to probability
    // If avgG1H = 1.4, roughly 75% of matches have at least 1 goal in 1H
    const g1hProbability = Math.min(0.85, 0.5 + avgG1H * 0.2)

    // Convert probability to odds (with margin)
    const margin = 1.05 // 5% margin
    const g1hYes = parseFloat((margin / g1hProbability).toFixed(2))
    const g1hNo = parseFloat((margin / (1 - g1hProbability)).toFixed(2))

    return { g1hYes, g1hNo }
  }

  /**
   * Map API-Football status to our status
   */
  private mapFixtureStatus(apiStatus: string): string {
    const statusMap: Record<string, string> = {
      TBD: 'SCHEDULED',
      NS: 'SCHEDULED',
      '1H': 'LIVE',
      HT: 'HALFTIME',
      '2H': 'LIVE',
      ET: 'LIVE',
      P: 'LIVE',
      FT: 'FINISHED',
      AET: 'FINISHED',
      PEN: 'FINISHED',
      BT: 'LIVE',
      SUSP: 'SUSPENDED',
      INT: 'SUSPENDED',
      PST: 'POSTPONED',
      CANC: 'CANCELLED',
      ABD: 'CANCELLED',
      AWD: 'FINISHED',
      WO: 'FINISHED',
    }
    return statusMap[apiStatus] || 'SCHEDULED'
  }

  /**
   * Full data refresh: matches + odds
   */
  async fullRefresh(date?: string, daysAhead = 7): Promise<RefreshResultDto> {
    await this.logService.info(
      FhgLogCategory.PIPELINE,
      `Starting full data refresh (${daysAhead} days ahead)`
    )

    // Import matches
    const matchResult = await this.importMatches(date, daysAhead)

    // Import odds for new matches
    const oddsResult = await this.importOdds()

    return {
      created: matchResult.created + oddsResult.created,
      updated: matchResult.updated + oddsResult.updated,
      failed: matchResult.failed + oddsResult.failed,
      success: matchResult.success && oddsResult.success,
    }
  }
}
