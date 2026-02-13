import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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
      }>;
    }>;
  }>;
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

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ODDS_API_KEY') || '';
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
      this.logger.error(`Error fetching odds: ${error.message}`);
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
      this.logger.error(`Error fetching league odds: ${error.message}`);
      return [];
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
}
