// Adapter for API-Football service - normalizes data for chat

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MatchData,
  TeamData,
  StandingEntry,
  FOOTBALL_LEAGUE_IDS,
  Locale,
} from '../types';
import { CURRENT_SEASON, CACHE_TTL } from '../constants';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class ApiFootballAdapter {
  private readonly logger = new Logger(ApiFootballAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://v3.football.api-sports.io';

  // In-memory cache
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('API_FOOTBALL_KEY') || '';
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
   * Get upcoming fixtures for a league
   */
  async getLeagueMatches(
    leagueId: string,
    date?: string,
  ): Promise<MatchData[]> {
    const leagueConfig = FOOTBALL_LEAGUE_IDS[leagueId];
    if (!leagueConfig) {
      this.logger.warn(`Unknown league: ${leagueId}`);
      return [];
    }

    const cacheKey = `fixtures:${leagueId}:${date || 'upcoming'}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.FIXTURES, async () => {
      if (!this.apiKey) {
        this.logger.warn('No API_FOOTBALL_KEY configured');
        return [];
      }

      try {
        const today = new Date();
        const from = date || today.toISOString().split('T')[0];
        const toDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const to = toDate.toISOString().split('T')[0];

        const url = `${this.baseUrl}/fixtures?league=${leagueConfig.apiId}&season=${CURRENT_SEASON}&from=${from}&to=${to}`;
        this.logger.log(`Fetching: ${url}`);

        const response = await fetch(url, {
          headers: { 'x-apisports-key': this.apiKey },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const fixtures = data.response || [];

        return fixtures.map((fixture: any) => this.normalizeMatch(fixture, leagueId));
      } catch (error) {
        this.logger.error(`Error fetching fixtures: ${error.message}`);
        return [];
      }
    });
  }

  /**
   * Get matches for a specific team
   */
  async getTeamMatches(teamName: string, leagueId?: string): Promise<MatchData[]> {
    const teamId = await this.searchTeam(teamName);
    if (!teamId) {
      this.logger.warn(`Team not found: ${teamName}`);
      return [];
    }

    const cacheKey = `team-matches:${teamId}:${leagueId || 'all'}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.FIXTURES, async () => {
      if (!this.apiKey) return [];

      try {
        const today = new Date();
        const pastDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const futureDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

        let url = `${this.baseUrl}/fixtures?team=${teamId}&from=${pastDate.toISOString().split('T')[0]}&to=${futureDate.toISOString().split('T')[0]}`;

        if (leagueId && FOOTBALL_LEAGUE_IDS[leagueId]) {
          url += `&league=${FOOTBALL_LEAGUE_IDS[leagueId].apiId}`;
        }

        const response = await fetch(url, {
          headers: { 'x-apisports-key': this.apiKey },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const fixtures = data.response || [];

        return fixtures.map((fixture: any) =>
          this.normalizeMatch(fixture, leagueId || this.inferLeagueId(fixture.league.id))
        );
      } catch (error) {
        this.logger.error(`Error fetching team matches: ${error.message}`);
        return [];
      }
    });
  }

  /**
   * Get standings for a league
   */
  async getStandings(leagueId: string): Promise<StandingEntry[]> {
    const leagueConfig = FOOTBALL_LEAGUE_IDS[leagueId];
    if (!leagueConfig) {
      this.logger.warn(`Unknown league: ${leagueId}`);
      return [];
    }

    const cacheKey = `standings:${leagueId}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.STANDINGS, async () => {
      if (!this.apiKey) return [];

      try {
        const url = `${this.baseUrl}/standings?league=${leagueConfig.apiId}&season=${CURRENT_SEASON}`;
        this.logger.log(`Fetching standings: ${url}`);

        const response = await fetch(url, {
          headers: { 'x-apisports-key': this.apiKey },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const standings = data.response?.[0]?.league?.standings?.[0] || [];

        return standings.map((entry: any) => this.normalizeStanding(entry));
      } catch (error) {
        this.logger.error(`Error fetching standings: ${error.message}`);
        return [];
      }
    });
  }

  /**
   * Get live scores
   */
  async getLiveScores(leagueId?: string): Promise<MatchData[]> {
    const cacheKey = `live:${leagueId || 'all'}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.LIVE_SCORES, async () => {
      if (!this.apiKey) return [];

      try {
        let url = `${this.baseUrl}/fixtures?live=all`;

        if (leagueId && FOOTBALL_LEAGUE_IDS[leagueId]) {
          url = `${this.baseUrl}/fixtures?live=${FOOTBALL_LEAGUE_IDS[leagueId].apiId}`;
        }

        const response = await fetch(url, {
          headers: { 'x-apisports-key': this.apiKey },
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const fixtures = data.response || [];

        return fixtures.map((fixture: any) =>
          this.normalizeMatch(fixture, this.inferLeagueId(fixture.league.id))
        );
      } catch (error) {
        this.logger.error(`Error fetching live scores: ${error.message}`);
        return [];
      }
    });
  }

  /**
   * Search for a team by name
   */
  async searchTeam(query: string): Promise<number | null> {
    if (!this.apiKey) return null;

    const cacheKey = `team-search:${query.toLowerCase()}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.TEAM_INFO, async () => {
      try {
        const response = await fetch(
          `${this.baseUrl}/teams?search=${encodeURIComponent(query)}`,
          { headers: { 'x-apisports-key': this.apiKey } },
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const teams = data.response || [];

        if (teams.length > 0) {
          return teams[0].team.id;
        }

        return null;
      } catch (error) {
        this.logger.error(`Error searching team: ${error.message}`);
        return null;
      }
    });
  }

  /**
   * Get head-to-head between two teams
   */
  async getHeadToHead(team1: string, team2: string): Promise<any> {
    const team1Id = await this.searchTeam(team1);
    const team2Id = await this.searchTeam(team2);

    if (!team1Id || !team2Id) {
      return null;
    }

    const cacheKey = `h2h:${team1Id}-${team2Id}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.FIXTURES, async () => {
      if (!this.apiKey) return null;

      try {
        const response = await fetch(
          `${this.baseUrl}/fixtures/headtohead?h2h=${team1Id}-${team2Id}&last=10`,
          { headers: { 'x-apisports-key': this.apiKey } },
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const fixtures = data.response || [];

        if (!fixtures.length) return null;

        let team1Wins = 0;
        let team2Wins = 0;
        let draws = 0;
        let totalGoals = 0;

        fixtures.forEach((fixture: any) => {
          const homeGoals = fixture.goals.home;
          const awayGoals = fixture.goals.away;
          totalGoals += homeGoals + awayGoals;

          if (homeGoals > awayGoals) {
            if (fixture.teams.home.id === team1Id) team1Wins++;
            else team2Wins++;
          } else if (homeGoals < awayGoals) {
            if (fixture.teams.away.id === team1Id) team1Wins++;
            else team2Wins++;
          } else {
            draws++;
          }
        });

        return {
          team1: { id: team1Id, name: team1, wins: team1Wins },
          team2: { id: team2Id, name: team2, wins: team2Wins },
          draws,
          avgGoals: parseFloat((totalGoals / fixtures.length).toFixed(2)),
          totalMatches: fixtures.length,
          recentMatches: fixtures.slice(0, 5).map((f: any) => ({
            date: f.fixture.date,
            home: f.teams.home.name,
            away: f.teams.away.name,
            score: `${f.goals.home}-${f.goals.away}`,
          })),
        };
      } catch (error) {
        this.logger.error(`Error fetching H2H: ${error.message}`);
        return null;
      }
    });
  }

  /**
   * Get top scorers for a league
   */
  async getTopScorers(leagueId: string, limit = 10): Promise<any[]> {
    const leagueConfig = FOOTBALL_LEAGUE_IDS[leagueId];
    if (!leagueConfig) return [];

    const cacheKey = `scorers:${leagueId}`;
    return this.fetchWithCache(cacheKey, CACHE_TTL.STANDINGS, async () => {
      if (!this.apiKey) return [];

      try {
        const response = await fetch(
          `${this.baseUrl}/players/topscorers?league=${leagueConfig.apiId}&season=${CURRENT_SEASON}`,
          { headers: { 'x-apisports-key': this.apiKey } },
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const scorers = data.response || [];

        return scorers.slice(0, limit).map((scorer: any, index: number) => ({
          rank: index + 1,
          player: scorer.player.name,
          team: scorer.statistics[0]?.team?.name,
          goals: scorer.statistics[0]?.goals?.total || 0,
          assists: scorer.statistics[0]?.goals?.assists || 0,
          photo: scorer.player.photo,
        }));
      } catch (error) {
        this.logger.error(`Error fetching top scorers: ${error.message}`);
        return [];
      }
    });
  }

  // Helper: Normalize match data
  private normalizeMatch(fixture: any, leagueId: string): MatchData {
    const matchDate = new Date(fixture.fixture.date);
    const leagueConfig = FOOTBALL_LEAGUE_IDS[leagueId];

    let status: MatchData['status'] = 'scheduled';
    if (fixture.fixture.status.short === 'FT') status = 'finished';
    else if (['1H', '2H', 'HT', 'ET', 'P'].includes(fixture.fixture.status.short)) status = 'live';
    else if (fixture.fixture.status.short === 'PST') status = 'postponed';

    return {
      id: String(fixture.fixture.id),
      homeTeam: {
        id: String(fixture.teams.home.id),
        name: fixture.teams.home.name,
        code: fixture.teams.home.name.substring(0, 3).toUpperCase(),
        logo: fixture.teams.home.logo,
      },
      awayTeam: {
        id: String(fixture.teams.away.id),
        name: fixture.teams.away.name,
        code: fixture.teams.away.name.substring(0, 3).toUpperCase(),
        logo: fixture.teams.away.logo,
      },
      date: matchDate.toISOString().split('T')[0],
      time: matchDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      venue: fixture.fixture.venue?.name,
      league: {
        id: leagueId,
        name: leagueConfig?.name.es || fixture.league.name,
        logo: fixture.league.logo,
      },
      status,
      score:
        status !== 'scheduled'
          ? {
              home: fixture.goals.home || 0,
              away: fixture.goals.away || 0,
            }
          : undefined,
      minute: fixture.fixture.status.elapsed || undefined,
    };
  }

  // Helper: Normalize standing entry
  private normalizeStanding(entry: any): StandingEntry {
    return {
      position: entry.rank,
      team: {
        id: String(entry.team.id),
        name: entry.team.name,
        code: entry.team.name.substring(0, 3).toUpperCase(),
        logo: entry.team.logo,
      },
      played: entry.all.played,
      won: entry.all.win,
      drawn: entry.all.draw,
      lost: entry.all.lose,
      goalsFor: entry.all.goals.for,
      goalsAgainst: entry.all.goals.against,
      goalDifference: entry.goalsDiff,
      points: entry.points,
      form: entry.form?.split('').slice(-5),
    };
  }

  // Helper: Infer league ID from API-Football league ID
  private inferLeagueId(apiLeagueId: number): string {
    for (const [id, config] of Object.entries(FOOTBALL_LEAGUE_IDS)) {
      if (config.apiId === apiLeagueId) return id;
    }
    return 'unknown';
  }
}
