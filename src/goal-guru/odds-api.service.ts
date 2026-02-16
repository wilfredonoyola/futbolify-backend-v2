import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { FhgLogService } from './services/fhg-log.service';
import { FhgLogCategory } from './enums/fhg-log-category.enum';

interface OddsApiResponse {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

/**
 * First Half Goal odds for a match
 */
export interface FirstHalfOdds {
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmakers: Array<{
    bookmaker: string;
    g1hYes: number | null;
    g1hNo: number | null;
  }>;
  bestG1hYes: number | null;
  bestG1hYesBookmaker: string | null;
  bestG1hNo: number | null;
  bestG1hNoBookmaker: string | null;
  avgG1hYes: number | null;
  avgG1hNo: number | null;
  impliedProbG1hYes: number | null;
}

interface MatchOdds {
  homeWin: number;
  draw: number;
  awayWin: number;
  bookmakers: string[];
  lastUpdate: string;
}

@Injectable()
export class OddsApiService {
  private readonly logger = new Logger(OddsApiService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.the-odds-api.com/v4';
  private cache: Map<string, { data: MatchOdds; expiresAt: number }> = new Map();

  constructor(
    private configService: ConfigService,
    @Optional() private readonly fhgLogService?: FhgLogService
  ) {
    this.apiKey = this.configService.get<string>('ODDS_API_KEY') || '';
  }

  /**
   * Log to both console and FHG dashboard
   */
  private async logError(message: string, data?: Record<string, unknown>): Promise<void> {
    this.logger.error(message);
    if (this.fhgLogService) {
      try {
        await this.fhgLogService.error(FhgLogCategory.ODDS, message, data);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Get real odds for a specific match
   */
  async getMatchOdds(
    homeTeam: string,
    awayTeam: string,
    sport = 'soccer',
  ): Promise<MatchOdds | null> {
    if (!this.apiKey) {
      this.logger.warn('ODDS_API_KEY not configured, using fallback');
      return this.getFallbackOdds();
    }

    const cacheKey = `${homeTeam}-${awayTeam}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`Cache hit for odds: ${cacheKey}`);
      return cached.data;
    }

    try {
      // Get soccer leagues odds
      const response = await axios.get<OddsApiResponse[]>(
        `${this.baseUrl}/sports/${sport}_epl/odds`,
        {
          params: {
            apiKey: this.apiKey,
            regions: 'eu,uk',
            markets: 'h2h',
            oddsFormat: 'decimal',
          },
          timeout: 5000,
        },
      );

      // Find matching match
      const match = response.data.find(
        (m) =>
          this.normalizeTeamName(m.home_team) === this.normalizeTeamName(homeTeam) &&
          this.normalizeTeamName(m.away_team) === this.normalizeTeamName(awayTeam),
      );

      if (!match || !match.bookmakers.length) {
        this.logger.warn(`No odds found for ${homeTeam} vs ${awayTeam}`);
        return this.getFallbackOdds();
      }

      // Calculate average odds from multiple bookmakers
      const odds = this.calculateAverageOdds(match.bookmakers);
      const bookmakers = match.bookmakers.map((b) => b.title);

      const result: MatchOdds = {
        ...odds,
        bookmakers,
        lastUpdate: new Date().toISOString(),
      };

      // Cache for 1 hour
      this.cache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });

      return result;
    } catch (error) {
      await this.handleOddsApiError(error, `${homeTeam} vs ${awayTeam}`);
      return this.getFallbackOdds();
    }
  }

  /**
   * Get odds for multiple leagues
   */
  async getLeagueOdds(league: string): Promise<OddsApiResponse[]> {
    if (!this.apiKey) {
      this.logger.warn('ODDS_API_KEY not configured');
      return [];
    }

    try {
      const sportKey = this.mapLeagueToSportKey(league);
      const response = await axios.get<OddsApiResponse[]>(
        `${this.baseUrl}/sports/${sportKey}/odds`,
        {
          params: {
            apiKey: this.apiKey,
            regions: 'eu,uk',
            markets: 'h2h',
            oddsFormat: 'decimal',
          },
          timeout: 5000,
        },
      );

      return response.data;
    } catch (error) {
      await this.handleOddsApiError(error, `league: ${league}`);
      return [];
    }
  }

  /**
   * Handle OddsAPI errors with specific messages
   */
  private async handleOddsApiError(error: unknown, context: string): Promise<void> {
    const axiosError = error as AxiosError<{ message?: string }>;
    const status = axiosError.response?.status;
    const message = axiosError.message || 'Unknown error';

    if (status === 401) {
      await this.logError(
        `❌ ODDS API AUTH ERROR: Invalid API key. Check ODDS_API_KEY in .env`,
        { provider: 'the-odds-api', status, context }
      );
    } else if (status === 402) {
      await this.logError(
        `❌ ODDS API QUOTA ERROR: Monthly quota exceeded. Upgrade at the-odds-api.com`,
        { provider: 'the-odds-api', status, context }
      );
    } else if (status === 429) {
      await this.logError(
        `⚠️ ODDS API RATE LIMIT: Too many requests. Try again later.`,
        { provider: 'the-odds-api', status, context }
      );
    } else if (status === 500 || status === 503) {
      await this.logError(
        `⚠️ ODDS API SERVER ERROR: Service temporarily unavailable`,
        { provider: 'the-odds-api', status, context }
      );
    } else {
      await this.logError(
        `❌ ODDS API ERROR: ${message} (${context})`,
        { provider: 'the-odds-api', status, context, error: message }
      );
    }
  }

  /**
   * Calculate average odds from multiple bookmakers
   */
  private calculateAverageOdds(bookmakers: OddsApiResponse['bookmakers']): {
    homeWin: number;
    draw: number;
    awayWin: number;
  } {
    let homeSum = 0;
    let drawSum = 0;
    let awaySum = 0;
    let count = 0;

    for (const bookmaker of bookmakers) {
      const h2hMarket = bookmaker.markets.find((m) => m.key === 'h2h');
      if (!h2hMarket) continue;

      const homeOutcome = h2hMarket.outcomes.find((o) => o.name.includes('Home') || o.name === bookmaker.key);
      const drawOutcome = h2hMarket.outcomes.find((o) => o.name === 'Draw');
      const awayOutcome = h2hMarket.outcomes.find((o) => o.name.includes('Away'));

      if (homeOutcome) homeSum += homeOutcome.price;
      if (drawOutcome) drawSum += drawOutcome.price;
      if (awayOutcome) awaySum += awayOutcome.price;
      count++;
    }

    return {
      homeWin: count > 0 ? parseFloat((homeSum / count).toFixed(2)) : 2.0,
      draw: count > 0 ? parseFloat((drawSum / count).toFixed(2)) : 3.2,
      awayWin: count > 0 ? parseFloat((awaySum / count).toFixed(2)) : 3.5,
    };
  }

  /**
   * Fallback odds when API is not available
   */
  private getFallbackOdds(): MatchOdds {
    return {
      homeWin: 2.0,
      draw: 3.2,
      awayWin: 3.5,
      bookmakers: ['Fallback'],
      lastUpdate: new Date().toISOString(),
    };
  }

  /**
   * Normalize team names for matching
   */
  private normalizeTeamName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Map league ID to The Odds API sport key
   */
  private mapLeagueToSportKey(league: string): string {
    const mapping: Record<string, string> = {
      '39': 'soccer_epl', // Premier League
      '140': 'soccer_spain_la_liga', // La Liga
      '135': 'soccer_italy_serie_a', // Serie A
      '78': 'soccer_germany_bundesliga', // Bundesliga
      '61': 'soccer_france_ligue_one', // Ligue 1
      '2': 'soccer_uefa_champs_league', // Champions League
    };

    return mapping[league] || 'soccer_epl';
  }

  /**
   * Map FHG league codes to The Odds API sport keys
   */
  private mapFhgLeagueToSportKey(leagueCode: string): string | null {
    const mapping: Record<string, string> = {
      'premier-league': 'soccer_epl',
      'bundesliga': 'soccer_germany_bundesliga',
      'serie-a': 'soccer_italy_serie_a',
      'la-liga': 'soccer_spain_la_liga',
      'ligue-1': 'soccer_france_ligue_one',
      'champions': 'soccer_uefa_champs_league',
      'eredivisie': 'soccer_netherlands_eredivisie',
      'danish-superliga': 'soccer_denmark_superliga',
      'norwegian-eliteserien': 'soccer_norway_eliteserien',
      'liga-mx': 'soccer_mexico_ligamx',
    };

    return mapping[leagueCode] || null;
  }

  /**
   * Get First Half Goal (G1H) odds for a league
   * Uses the totals_h1 market with Over 0.5 line
   *
   * @param leagueCode FHG league code (e.g., 'premier-league', 'bundesliga')
   * @returns Array of FirstHalfOdds for all matches in the league
   */
  async getFirstHalfOdds(leagueCode: string): Promise<FirstHalfOdds[]> {
    if (!this.apiKey) {
      this.logger.warn('ODDS_API_KEY not configured, cannot fetch G1H odds');
      return [];
    }

    const sportKey = this.mapFhgLeagueToSportKey(leagueCode);
    if (!sportKey) {
      this.logger.warn(`No sport key mapping for league: ${leagueCode}`);
      return [];
    }

    try {
      // Fetch totals_h1 market (First Half Over/Under)
      const response = await axios.get<OddsApiResponse[]>(
        `${this.baseUrl}/sports/${sportKey}/odds`,
        {
          params: {
            apiKey: this.apiKey,
            regions: 'eu,uk',
            markets: 'totals_h1',
            oddsFormat: 'decimal',
          },
          timeout: 10000,
        }
      );

      const results: FirstHalfOdds[] = [];

      for (const match of response.data) {
        const bookmakerOdds: Array<{
          bookmaker: string;
          g1hYes: number | null;
          g1hNo: number | null;
        }> = [];

        let bestG1hYes: number | null = null;
        let bestG1hYesBookmaker: string | null = null;
        let bestG1hNo: number | null = null;
        let bestG1hNoBookmaker: string | null = null;
        let totalG1hYes = 0;
        let totalG1hNo = 0;
        let countYes = 0;
        let countNo = 0;

        for (const bookmaker of match.bookmakers) {
          const totalsMarket = bookmaker.markets.find(
            (m) => m.key === 'totals_h1'
          );

          if (!totalsMarket) continue;

          // Find Over 0.5 (G1H Yes) and Under 0.5 (G1H No)
          const overOutcome = totalsMarket.outcomes.find(
            (o) => o.name === 'Over' && o.point === 0.5
          );
          const underOutcome = totalsMarket.outcomes.find(
            (o) => o.name === 'Under' && o.point === 0.5
          );

          const g1hYes = overOutcome?.price ?? null;
          const g1hNo = underOutcome?.price ?? null;

          bookmakerOdds.push({
            bookmaker: bookmaker.title,
            g1hYes,
            g1hNo,
          });

          // Track best odds
          if (g1hYes !== null) {
            totalG1hYes += g1hYes;
            countYes++;
            if (bestG1hYes === null || g1hYes > bestG1hYes) {
              bestG1hYes = g1hYes;
              bestG1hYesBookmaker = bookmaker.title;
            }
          }

          if (g1hNo !== null) {
            totalG1hNo += g1hNo;
            countNo++;
            if (bestG1hNo === null || g1hNo > bestG1hNo) {
              bestG1hNo = g1hNo;
              bestG1hNoBookmaker = bookmaker.title;
            }
          }
        }

        // Calculate averages
        const avgG1hYes = countYes > 0
          ? parseFloat((totalG1hYes / countYes).toFixed(2))
          : null;
        const avgG1hNo = countNo > 0
          ? parseFloat((totalG1hNo / countNo).toFixed(2))
          : null;

        // Calculate implied probability
        const impliedProbG1hYes = avgG1hYes
          ? parseFloat((1 / avgG1hYes).toFixed(4))
          : null;

        results.push({
          homeTeam: match.home_team,
          awayTeam: match.away_team,
          commenceTime: match.commence_time,
          bookmakers: bookmakerOdds,
          bestG1hYes,
          bestG1hYesBookmaker,
          bestG1hNo,
          bestG1hNoBookmaker,
          avgG1hYes,
          avgG1hNo,
          impliedProbG1hYes,
        });
      }

      await this.logInfo(
        `Fetched G1H odds for ${leagueCode}: ${results.length} matches`,
        { leagueCode, matchCount: results.length }
      );

      return results;
    } catch (error) {
      await this.handleOddsApiError(error, `G1H odds for ${leagueCode}`);
      return [];
    }
  }

  /**
   * Log info to both console and FHG dashboard
   */
  private async logInfo(message: string, data?: Record<string, unknown>): Promise<void> {
    this.logger.log(message);
    if (this.fhgLogService) {
      try {
        await this.fhgLogService.info(FhgLogCategory.ODDS, message, data);
      } catch {
        // Ignore
      }
    }
  }
}
