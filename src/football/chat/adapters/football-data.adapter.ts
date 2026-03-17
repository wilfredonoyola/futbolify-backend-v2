// Adapter for Football-Data.org API (FREE tier)
// Supports: Premier League, La Liga, Champions League, Bundesliga, Serie A, Ligue 1
// Rate limit: 10 calls/minute
// Current season included in free tier

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchData, TeamData, StandingEntry, Locale } from '../types';
import { CACHE_TTL } from '../constants';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Football-Data.org competition codes
const COMPETITION_CODES: Record<string, string> = {
  'la-liga': 'PD',           // Primera Division
  'premier-league': 'PL',    // Premier League
  'champions-league': 'CL',  // Champions League
  'bundesliga': 'BL1',       // Bundesliga
  'serie-a': 'SA',           // Serie A
  'ligue-1': 'FL1',          // Ligue 1
};

@Injectable()
export class FootballDataAdapter {
  private readonly logger = new Logger(FootballDataAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.football-data.org/v4';
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private lastRequestTime = 0;
  private readonly minRequestInterval = 6000; // 10 calls/min = 1 call per 6 seconds

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('FOOTBALL_DATA_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn('⚠️ No FOOTBALL_DATA_KEY configured - using API-Football fallback');
    } else {
      this.logger.log('✅ Football-Data.org API configured (FREE tier for European leagues)');
    }
  }

  /**
   * Check if this adapter supports the given league
   */
  supportsLeague(leagueId: string): boolean {
    return !!COMPETITION_CODES[leagueId];
  }

  /**
   * Rate limiting - wait if needed
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      this.logger.debug(`Rate limiting: waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  private async fetchWithCache<T>(
    cacheKey: string,
    ttl: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = this.cache.get(cacheKey) as CacheEntry<T> | undefined;
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(`Cache hit: ${cacheKey}`);
      return cached.data;
    }

    const data = await fetcher();
    this.cache.set(cacheKey, { data, expiresAt: Date.now() + ttl });
    return data;
  }

  /**
   * Get upcoming matches for a league
   */
  async getLeagueMatches(leagueId: string): Promise<MatchData[]> {
    const competitionCode = COMPETITION_CODES[leagueId];
    if (!competitionCode) {
      this.logger.warn(`League ${leagueId} not supported by Football-Data.org`);
      return [];
    }

    const cacheKey = `fd-matches:${leagueId}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.FIXTURES, async () => {
      if (!this.apiKey) return [];

      try {
        await this.waitForRateLimit();

        // Get matches for next 14 days
        const today = new Date();
        const futureDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        const dateFrom = today.toISOString().split('T')[0];
        const dateTo = futureDate.toISOString().split('T')[0];

        const url = `${this.baseUrl}/competitions/${competitionCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
        this.logger.log(`Fetching: ${url}`);

        const response = await fetch(url, {
          headers: { 'X-Auth-Token': this.apiKey },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const matches = data.matches || [];

        this.logger.log(`Found ${matches.length} matches for ${leagueId}`);

        return matches.map((m: any) => this.normalizeMatch(m, leagueId));
      } catch (error) {
        this.logger.error(`Error fetching league matches: ${error.message}`);
        return [];
      }
    });
  }

  /**
   * Get matches for a specific team
   */
  async getTeamMatches(teamName: string, leagueId?: string): Promise<MatchData[]> {
    // First, search for the team
    const teamId = await this.searchTeam(teamName);
    if (!teamId) {
      this.logger.warn(`Team not found: ${teamName}`);
      return [];
    }

    const cacheKey = `fd-team-matches:${teamId}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.FIXTURES, async () => {
      if (!this.apiKey) return [];

      try {
        await this.waitForRateLimit();

        // Get matches for next 30 days
        const today = new Date();
        const pastDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const dateFrom = pastDate.toISOString().split('T')[0];
        const dateTo = futureDate.toISOString().split('T')[0];

        const url = `${this.baseUrl}/teams/${teamId}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
        this.logger.log(`Fetching team matches: ${url}`);

        const response = await fetch(url, {
          headers: { 'X-Auth-Token': this.apiKey },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const matches = data.matches || [];

        this.logger.log(`Found ${matches.length} matches for team ${teamName} (ID: ${teamId})`);

        return matches.map((m: any) => {
          // Infer league from match data
          const matchLeagueId = this.inferLeagueId(m.competition?.code);
          return this.normalizeMatch(m, matchLeagueId || 'unknown');
        });
      } catch (error) {
        this.logger.error(`Error fetching team matches: ${error.message}`);
        return [];
      }
    });
  }

  /**
   * Search for a team by name
   */
  async searchTeam(query: string): Promise<number | null> {
    if (!this.apiKey) return null;

    const cacheKey = `fd-team-search:${query.toLowerCase()}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.TEAM_INFO, async () => {
      try {
        await this.waitForRateLimit();

        // Football-Data.org doesn't have a direct team search endpoint
        // We need to search through competitions - try La Liga first, then Premier
        const competitionsToSearch = ['PD', 'PL', 'CL', 'BL1', 'SA'];

        for (const comp of competitionsToSearch) {
          const url = `${this.baseUrl}/competitions/${comp}/teams`;
          this.logger.debug(`Searching team in ${comp}: ${query}`);

          const response = await fetch(url, {
            headers: { 'X-Auth-Token': this.apiKey },
          });

          if (!response.ok) continue;

          const data = await response.json();
          const teams = data.teams || [];

          // Find team by name (case insensitive)
          const queryLower = query.toLowerCase();
          const team = teams.find(
            (t: any) =>
              t.name.toLowerCase().includes(queryLower) ||
              t.shortName?.toLowerCase().includes(queryLower) ||
              t.tla?.toLowerCase() === queryLower
          );

          if (team) {
            this.logger.log(`Found team: ${team.name} (ID: ${team.id}) in ${comp}`);
            return team.id;
          }

          // Rate limit between competition searches
          await this.waitForRateLimit();
        }

        this.logger.warn(`Team not found in any competition: ${query}`);
        return null;
      } catch (error) {
        this.logger.error(`Error searching team: ${error.message}`);
        return null;
      }
    });
  }

  /**
   * Get standings for a league
   */
  async getStandings(leagueId: string): Promise<StandingEntry[]> {
    const competitionCode = COMPETITION_CODES[leagueId];
    if (!competitionCode) {
      this.logger.warn(`League ${leagueId} not supported`);
      return [];
    }

    const cacheKey = `fd-standings:${leagueId}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.STANDINGS, async () => {
      if (!this.apiKey) return [];

      try {
        await this.waitForRateLimit();

        const url = `${this.baseUrl}/competitions/${competitionCode}/standings`;
        this.logger.log(`Fetching standings: ${url}`);

        const response = await fetch(url, {
          headers: { 'X-Auth-Token': this.apiKey },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const standings = data.standings?.[0]?.table || [];

        this.logger.log(`Found ${standings.length} teams in standings for ${leagueId}`);

        return standings.map((entry: any) => this.normalizeStanding(entry));
      } catch (error) {
        this.logger.error(`Error fetching standings: ${error.message}`);
        return [];
      }
    });
  }

  /**
   * Get top scorers for a league
   */
  async getTopScorers(leagueId: string, limit = 10): Promise<any[]> {
    const competitionCode = COMPETITION_CODES[leagueId];
    if (!competitionCode) return [];

    const cacheKey = `fd-scorers:${leagueId}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.STANDINGS, async () => {
      if (!this.apiKey) return [];

      try {
        await this.waitForRateLimit();

        const url = `${this.baseUrl}/competitions/${competitionCode}/scorers?limit=${limit}`;
        this.logger.log(`Fetching top scorers: ${url}`);

        const response = await fetch(url, {
          headers: { 'X-Auth-Token': this.apiKey },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const scorers = data.scorers || [];

        return scorers.map((scorer: any, index: number) => ({
          rank: index + 1,
          player: scorer.player?.name,
          team: scorer.team?.name,
          goals: scorer.goals || 0,
          assists: scorer.assists || 0,
          photo: scorer.player?.photo,
        }));
      } catch (error) {
        this.logger.error(`Error fetching top scorers: ${error.message}`);
        return [];
      }
    });
  }

  // Helper: Normalize match data
  private normalizeMatch(match: any, leagueId: string): MatchData {
    const matchDate = new Date(match.utcDate);

    let status: MatchData['status'] = 'scheduled';
    if (match.status === 'FINISHED') status = 'finished';
    else if (['IN_PLAY', 'PAUSED', 'HALFTIME'].includes(match.status)) status = 'live';
    else if (match.status === 'POSTPONED') status = 'postponed';

    return {
      id: String(match.id),
      homeTeam: {
        id: String(match.homeTeam?.id),
        name: match.homeTeam?.name || 'TBD',
        code: match.homeTeam?.tla || match.homeTeam?.name?.substring(0, 3).toUpperCase() || 'TBD',
        logo: match.homeTeam?.crest,
      },
      awayTeam: {
        id: String(match.awayTeam?.id),
        name: match.awayTeam?.name || 'TBD',
        code: match.awayTeam?.tla || match.awayTeam?.name?.substring(0, 3).toUpperCase() || 'TBD',
        logo: match.awayTeam?.crest,
      },
      date: matchDate.toISOString().split('T')[0],
      time: matchDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      }),
      venue: match.venue,
      league: {
        id: leagueId,
        name: match.competition?.name || leagueId,
        logo: match.competition?.emblem,
      },
      status,
      score:
        status !== 'scheduled'
          ? {
              home: match.score?.fullTime?.home ?? 0,
              away: match.score?.fullTime?.away ?? 0,
            }
          : undefined,
      minute: match.minute,
    };
  }

  // Helper: Normalize standing entry
  private normalizeStanding(entry: any): StandingEntry {
    return {
      position: entry.position,
      team: {
        id: String(entry.team?.id),
        name: entry.team?.name,
        code: entry.team?.tla || entry.team?.name?.substring(0, 3).toUpperCase(),
        logo: entry.team?.crest,
      },
      played: entry.playedGames,
      won: entry.won,
      drawn: entry.draw,
      lost: entry.lost,
      goalsFor: entry.goalsFor,
      goalsAgainst: entry.goalsAgainst,
      goalDifference: entry.goalDifference,
      points: entry.points,
      form: entry.form?.split(',').slice(-5),
    };
  }

  // Helper: Infer league ID from competition code
  private inferLeagueId(competitionCode: string): string | null {
    for (const [leagueId, code] of Object.entries(COMPETITION_CODES)) {
      if (code === competitionCode) return leagueId;
    }
    return null;
  }
}
