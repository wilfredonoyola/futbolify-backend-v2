import { Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoalGuruMatchDto } from './dto'
import { FhgLogService } from './services/fhg-log.service'
import { FhgLogCategory } from './enums/fhg-log-category.enum'

/**
 * Football-Data.org API Service
 * FREE tier: 12 leagues, 10 calls/minute
 *
 * Supported leagues (free):
 * - Premier League (PL)
 * - Bundesliga (BL1)
 * - La Liga (PD)
 * - Serie A (SA)
 * - Ligue 1 (FL1)
 * - Eredivisie (DED)
 * - Champions League (CL)
 * - Primeira Liga Portugal (PPL)
 */

// Football-Data.org competition codes
const COMPETITION_CODES: Record<string, string> = {
  'premier-league': 'PL',
  'bundesliga': 'BL1',
  'la-liga': 'PD',
  'serie-a': 'SA',
  'ligue-1': 'FL1',
  'eredivisie': 'DED',
  'champions': 'CL',
  // Not available in free tier:
  // 'liga-mx': null,
  // 'libertadores': null,
  // 'danish-superliga': null,
  // 'norwegian-eliteserien': null,
}

@Injectable()
export class FootballDataService {
  private readonly logger = new Logger(FootballDataService.name)
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.football-data.org/v4'

  // Rate limit: 10 calls/minute for free tier
  private lastCallTime = 0
  private readonly minCallInterval = 6000 // 6 seconds between calls (safe for 10/min)

  // Cache for fixtures (30 minutes)
  private readonly fixturesCache = new Map<
    string,
    { data: GoalGuruMatchDto[]; expiresAt: number }
  >()
  private readonly CACHE_TTL_MS = 30 * 60 * 1000

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly fhgLogService?: FhgLogService
  ) {
    this.apiKey = this.configService.get<string>('FOOTBALL_DATA_API_KEY') || ''
  }

  /**
   * Log error to console and FHG dashboard
   */
  private async logError(message: string, data?: Record<string, unknown>): Promise<void> {
    this.logger.error(message)
    if (this.fhgLogService) {
      try {
        await this.fhgLogService.error(FhgLogCategory.PIPELINE, message, data)
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Check if this league is supported in Football-Data.org free tier
   */
  isLeagueSupported(leagueId: string): boolean {
    return leagueId in COMPETITION_CODES
  }

  /**
   * Get upcoming fixtures for a league
   * Returns matches for today + next 2 days
   */
  async getUpcomingFixtures(leagueId: string): Promise<GoalGuruMatchDto[]> {
    const competitionCode = COMPETITION_CODES[leagueId]
    if (!competitionCode) {
      this.logger.warn(`League ${leagueId} not supported in Football-Data.org free tier`)
      return []
    }

    // Check cache
    const cacheKey = leagueId
    const cached = this.fixturesCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(`Football-Data cache hit for ${leagueId}`)
      return cached.data
    }

    // Rate limiting
    await this.waitForRateLimit()

    try {
      const today = new Date()
      const twoDaysLater = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)

      const dateFrom = today.toISOString().split('T')[0]
      const dateTo = twoDaysLater.toISOString().split('T')[0]

      const url = `${this.baseUrl}/competitions/${competitionCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`
      this.logger.log(`📡 Football-Data URL: ${url}`)

      const response = await fetch(url, {
        headers: {
          'X-Auth-Token': this.apiKey,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()

        if (response.status === 429) {
          await this.logError(
            `⚠️ FOOTBALL-DATA RATE LIMIT: Too many requests (10/min limit). Try again in 1 minute.`,
            { provider: 'football-data.org', status: 429, league: leagueId }
          )
        } else if (response.status === 401 || response.status === 403) {
          await this.logError(
            `❌ FOOTBALL-DATA AUTH ERROR: Invalid API key. Check FOOTBALL_DATA_API_KEY in .env`,
            { provider: 'football-data.org', status: response.status, league: leagueId }
          )
        } else if (response.status === 500 || response.status === 503) {
          await this.logError(
            `⚠️ FOOTBALL-DATA SERVER ERROR: Service temporarily unavailable`,
            { provider: 'football-data.org', status: response.status, league: leagueId }
          )
        } else {
          await this.logError(
            `❌ FOOTBALL-DATA ERROR: ${response.status} - ${errorText.slice(0, 100)}`,
            { provider: 'football-data.org', status: response.status, league: leagueId }
          )
        }
        return []
      }

      const data = await response.json()
      const matches = data.matches || []

      this.logger.log(`📊 Football-Data: ${matches.length} matches found for ${leagueId}`)

      // Parse matches
      const fixtures: GoalGuruMatchDto[] = matches.slice(0, 8).map((match: any) => {
        const matchDate = new Date(match.utcDate)
        return {
          home: match.homeTeam?.name || match.homeTeam?.shortName || 'TBD',
          away: match.awayTeam?.name || match.awayTeam?.shortName || 'TBD',
          date: matchDate.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
          }),
          time: matchDate.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          comp: data.competition?.name || leagueId,
        }
      })

      // Cache result
      this.fixturesCache.set(cacheKey, {
        data: fixtures,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      })

      return fixtures
    } catch (error: any) {
      await this.logError(
        `❌ FOOTBALL-DATA FETCH ERROR: ${error.message}`,
        { provider: 'football-data.org', league: leagueId, error: error.message }
      )
      return []
    }
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastCall = now - this.lastCallTime

    if (timeSinceLastCall < this.minCallInterval) {
      const waitTime = this.minCallInterval - timeSinceLastCall
      this.logger.debug(`Rate limiting: waiting ${waitTime}ms`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    this.lastCallTime = Date.now()
  }

  /**
   * Get list of supported leagues in free tier
   */
  getSupportedLeagues(): string[] {
    return Object.keys(COMPETITION_CODES)
  }
}
