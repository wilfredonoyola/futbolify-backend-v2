import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisCacheService } from '../../common/redis-cache.service'

/**
 * Cache TTL constants (in seconds)
 */
const CACHE_TTL = {
  ODDS: 180, // 3 minutes - odds change frequently
  SCORES: 60, // 1 minute - for live scores
}

/**
 * Odds from a single bookmaker
 */
export interface TheOddsBookmaker {
  key: string
  title: string
  lastUpdate: string
  markets: TheOddsMarket[]
}

/**
 * Market with outcomes
 */
export interface TheOddsMarket {
  key: string // "h2h", "totals", "spreads", "totals_h1", etc.
  lastUpdate: string
  outcomes: TheOddsOutcome[]
}

/**
 * Individual outcome/selection
 */
export interface TheOddsOutcome {
  name: string // "Over", "Under", team name, etc.
  price: number // decimal odds
  point?: number // for totals/spreads: the line (e.g., 2.5, 9.5)
}

/**
 * Event with odds from multiple bookmakers
 */
export interface TheOddsEvent {
  id: string
  sportKey: string
  sportTitle: string
  commenceTime: string // ISO date
  homeTeam: string
  awayTeam: string
  bookmakers: TheOddsBookmaker[]
}

/**
 * Score data
 */
export interface TheOddsScore {
  id: string
  sportKey: string
  sportTitle: string
  commenceTime: string
  completed: boolean
  homeTeam: string
  awayTeam: string
  scores: {
    name: string
    score: string
  }[] | null
  lastUpdate: string | null
}

/**
 * Normalized odds result for betting analysis
 */
export interface NormalizedOdds {
  eventId: string
  homeTeam: string
  awayTeam: string
  commenceTime: Date
  market: string
  line?: number
  bestOver: {
    price: number
    bookmaker: string
  } | null
  bestUnder: {
    price: number
    bookmaker: string
  } | null
  pinnacleOver?: number
  pinnacleUnder?: number
  allBookmakers: {
    bookmaker: string
    over: number
    under: number
  }[]
}

@Injectable()
export class OddsApiService {
  private readonly logger = new Logger(OddsApiService.name)
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.the-odds-api.com/v4'

  constructor(
    private readonly configService: ConfigService,
    private readonly redisCache: RedisCacheService
  ) {
    this.apiKey = this.configService.get<string>('ODDS_API_KEY') || ''
    if (!this.apiKey) {
      this.logger.warn('ODDS_API_KEY not configured')
    }
  }

  /**
   * Get odds for a specific sport/league
   *
   * @param sportKey - The Odds API sport key (e.g., "soccer_netherlands_eredivisie")
   * @param markets - Comma-separated markets (e.g., "totals,totals_h1")
   * @param regions - Regions for bookmakers (default: "eu,uk")
   */
  async getOdds(
    sportKey: string,
    markets: string = 'totals,totals_h1',
    regions: string = 'eu,uk'
  ): Promise<TheOddsEvent[]> {
    const cacheKey = `odds-api:odds:${sportKey}:${markets}:${regions}`

    const cached = await this.redisCache.get<TheOddsEvent[]>(cacheKey)
    if (cached) {
      this.logger.debug(`Cache hit for odds ${sportKey}`)
      return cached
    }

    if (!this.apiKey) {
      this.logger.warn('No API key, returning empty odds')
      return []
    }

    try {
      const url = new URL(`${this.baseUrl}/sports/${sportKey}/odds`)
      url.searchParams.set('apiKey', this.apiKey)
      url.searchParams.set('regions', regions)
      url.searchParams.set('markets', markets)
      url.searchParams.set('oddsFormat', 'decimal')

      const response = await fetch(url.toString())

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error(`Odds API error ${response.status}: ${errorText}`)
        return []
      }

      // Log remaining requests from headers
      const remaining = response.headers.get('x-requests-remaining')
      const used = response.headers.get('x-requests-used')
      this.logger.debug(`Odds API quota: ${remaining} remaining, ${used} used`)

      const events: TheOddsEvent[] = await response.json()

      await this.redisCache.set(cacheKey, events, CACHE_TTL.ODDS)
      this.logger.log(`Fetched ${events.length} events with odds for ${sportKey}`)

      return events
    } catch (error) {
      this.logger.error(`Error fetching odds: ${error.message}`)
      return []
    }
  }

  /**
   * Get scores for a specific sport/league
   */
  async getScores(
    sportKey: string,
    daysFrom: number = 1
  ): Promise<TheOddsScore[]> {
    const cacheKey = `odds-api:scores:${sportKey}:${daysFrom}`

    const cached = await this.redisCache.get<TheOddsScore[]>(cacheKey)
    if (cached) {
      return cached
    }

    if (!this.apiKey) {
      return []
    }

    try {
      const url = new URL(`${this.baseUrl}/sports/${sportKey}/scores`)
      url.searchParams.set('apiKey', this.apiKey)
      url.searchParams.set('daysFrom', daysFrom.toString())

      const response = await fetch(url.toString())

      if (!response.ok) {
        this.logger.error(`Scores API error ${response.status}`)
        return []
      }

      const scores: TheOddsScore[] = await response.json()

      await this.redisCache.set(cacheKey, scores, CACHE_TTL.SCORES)
      this.logger.log(`Fetched ${scores.length} scores for ${sportKey}`)

      return scores
    } catch (error) {
      this.logger.error(`Error fetching scores: ${error.message}`)
      return []
    }
  }

  /**
   * Get normalized odds for a specific market
   * Extracts best odds across bookmakers and identifies Pinnacle (sharp) line
   */
  async getNormalizedOdds(
    sportKey: string,
    market: string = 'totals'
  ): Promise<NormalizedOdds[]> {
    const events = await this.getOdds(sportKey, market)
    const results: NormalizedOdds[] = []

    for (const event of events) {
      // Group by line (for totals markets)
      const lineMap = new Map<number | undefined, NormalizedOdds>()

      for (const bookmaker of event.bookmakers) {
        for (const mkt of bookmaker.markets) {
          if (mkt.key !== market) continue

          // Find Over and Under outcomes
          const overOutcome = mkt.outcomes.find((o) => o.name === 'Over')
          const underOutcome = mkt.outcomes.find((o) => o.name === 'Under')

          if (!overOutcome || !underOutcome) continue

          const line = overOutcome.point

          let normalized = lineMap.get(line)
          if (!normalized) {
            normalized = {
              eventId: event.id,
              homeTeam: event.homeTeam,
              awayTeam: event.awayTeam,
              commenceTime: new Date(event.commenceTime),
              market,
              line,
              bestOver: null,
              bestUnder: null,
              allBookmakers: [],
            }
            lineMap.set(line, normalized)
          }

          // Track all bookmakers
          normalized.allBookmakers.push({
            bookmaker: bookmaker.key,
            over: overOutcome.price,
            under: underOutcome.price,
          })

          // Update best odds
          if (!normalized.bestOver || overOutcome.price > normalized.bestOver.price) {
            normalized.bestOver = {
              price: overOutcome.price,
              bookmaker: bookmaker.key,
            }
          }
          if (!normalized.bestUnder || underOutcome.price > normalized.bestUnder.price) {
            normalized.bestUnder = {
              price: underOutcome.price,
              bookmaker: bookmaker.key,
            }
          }

          // Track Pinnacle as sharp reference
          if (bookmaker.key === 'pinnacle') {
            normalized.pinnacleOver = overOutcome.price
            normalized.pinnacleUnder = underOutcome.price
          }
        }
      }

      results.push(...lineMap.values())
    }

    return results
  }

  /**
   * Find best odds for a specific event and market
   */
  async findBestOdds(
    sportKey: string,
    homeTeam: string,
    awayTeam: string,
    market: string = 'totals',
    line?: number
  ): Promise<NormalizedOdds | null> {
    const allOdds = await this.getNormalizedOdds(sportKey, market)

    // Find matching event (fuzzy match on team names)
    const event = allOdds.find((o) => {
      const homeMatch =
        o.homeTeam.toLowerCase().includes(homeTeam.toLowerCase()) ||
        homeTeam.toLowerCase().includes(o.homeTeam.toLowerCase())
      const awayMatch =
        o.awayTeam.toLowerCase().includes(awayTeam.toLowerCase()) ||
        awayTeam.toLowerCase().includes(o.awayTeam.toLowerCase())
      const lineMatch = line === undefined || o.line === line

      return homeMatch && awayMatch && lineMatch
    })

    return event || null
  }

  /**
   * Get all available first-half totals odds
   */
  async getFirstHalfOdds(sportKey: string): Promise<NormalizedOdds[]> {
    return this.getNormalizedOdds(sportKey, 'totals_h1')
  }

  /**
   * Get alternate totals (multiple lines)
   */
  async getAlternateTotals(sportKey: string): Promise<NormalizedOdds[]> {
    // The Odds API provides alternate_totals market for multiple lines
    return this.getNormalizedOdds(sportKey, 'alternate_totals')
  }

  /**
   * Calculate edge vs Pinnacle (sharp book)
   * Returns positive value if our bookmaker offers better odds than Pinnacle
   */
  calculateEdgeVsPinnacle(
    odds: NormalizedOdds,
    direction: 'over' | 'under'
  ): number {
    const pinnacleOdds =
      direction === 'over' ? odds.pinnacleOver : odds.pinnacleUnder
    const bestOdds =
      direction === 'over' ? odds.bestOver?.price : odds.bestUnder?.price

    if (!pinnacleOdds || !bestOdds) {
      return 0
    }

    // Edge = difference in implied probability
    // Positive means our odds are better than Pinnacle
    const pinnacleProb = 1 / pinnacleOdds
    const bestProb = 1 / bestOdds

    return pinnacleProb - bestProb
  }

  /**
   * Check if Pinnacle is available for a sport
   */
  async hasPinnacle(sportKey: string): Promise<boolean> {
    const events = await this.getOdds(sportKey, 'totals')
    if (events.length === 0) return false

    return events.some((e) =>
      e.bookmakers.some((b) => b.key === 'pinnacle')
    )
  }

  /**
   * Get available sports/leagues
   */
  async getAvailableSports(): Promise<
    Array<{ key: string; group: string; title: string; active: boolean }>
  > {
    if (!this.apiKey) {
      return []
    }

    try {
      const url = new URL(`${this.baseUrl}/sports`)
      url.searchParams.set('apiKey', this.apiKey)

      const response = await fetch(url.toString())

      if (!response.ok) {
        return []
      }

      return response.json()
    } catch (error) {
      this.logger.error(`Error fetching sports: ${error.message}`)
      return []
    }
  }

  /**
   * Check API status and get usage info from headers
   * The Odds API returns quota info in response headers:
   * - x-requests-remaining
   * - x-requests-used
   */
  async getApiStatus(): Promise<{
    configured: boolean
    available: boolean
    requestsUsed?: number
    requestsRemaining?: number
    message?: string
  }> {
    if (!this.apiKey) {
      return {
        configured: false,
        available: false,
        message: 'API key not configured (ODDS_API_KEY)',
      }
    }

    try {
      // Make a simple request to check status - sports endpoint is cheap
      const url = new URL(`${this.baseUrl}/sports`)
      url.searchParams.set('apiKey', this.apiKey)

      const response = await fetch(url.toString())

      if (!response.ok) {
        const errorText = await response.text()
        return {
          configured: true,
          available: false,
          message: `API error: ${response.status} - ${errorText}`,
        }
      }

      // Extract quota from headers
      const requestsUsed = parseInt(response.headers.get('x-requests-used') || '0')
      const requestsRemaining = parseInt(response.headers.get('x-requests-remaining') || '0')

      return {
        configured: true,
        available: true,
        requestsUsed,
        requestsRemaining,
      }
    } catch (error) {
      return {
        configured: true,
        available: false,
        message: `Connection error: ${error.message}`,
      }
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey
  }
}
