import { Injectable, Logger } from '@nestjs/common';
import {
  LiveMatchData,
  MatchEvent,
  MatchStatistic,
  MatchLineup,
  MatchLineupPlayer,
} from './dto/live-match.output';

interface CachedLiveMatch {
  data: LiveMatchData;
  cachedAt: Date;
  expiresAt: number;
}

@Injectable()
export class LiveMatchService {
  private readonly logger = new Logger(LiveMatchService.name);
  private readonly apiKey = process.env.API_FOOTBALL_KEY;
  private readonly baseUrl = 'https://v3.football.api-sports.io';

  // Cache for live match data (2 minutes for live, 5 minutes for finished)
  private readonly liveMatchCache = new Map<number, CachedLiveMatch>();
  private readonly LIVE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for live matches
  private readonly FINISHED_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes for finished

  /**
   * Get detailed live match data by fixture ID
   */
  async getLiveMatch(fixtureId: number): Promise<{ match: LiveMatchData | null; cachedAt: Date; cacheExpiresIn: number }> {
    // Check cache
    const cached = this.liveMatchCache.get(fixtureId);
    if (cached && Date.now() < cached.expiresAt) {
      const cacheExpiresIn = Math.floor((cached.expiresAt - Date.now()) / 1000);
      this.logger.debug(`Cache hit for fixture ${fixtureId}, expires in ${cacheExpiresIn}s`);
      return { match: cached.data, cachedAt: cached.cachedAt, cacheExpiresIn };
    }

    if (!this.apiKey) {
      this.logger.warn('No API_FOOTBALL_KEY configured');
      return { match: null, cachedAt: new Date(), cacheExpiresIn: 0 };
    }

    try {
      // Fetch fixture details, events, statistics, and lineups in parallel
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
      ]);

      const [fixtureData, eventsData, statsData, lineupsData] = await Promise.all([
        fixtureRes.json(),
        eventsRes.json(),
        statsRes.json(),
        lineupsRes.json(),
      ]);

      const fixture = fixtureData.response?.[0];
      if (!fixture) {
        this.logger.warn(`Fixture ${fixtureId} not found`);
        return { match: null, cachedAt: new Date(), cacheExpiresIn: 0 };
      }

      const match = this.parseFixtureData(
        fixture,
        eventsData.response || [],
        statsData.response || [],
        lineupsData.response || []
      );

      // Determine cache TTL based on match status
      const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'].includes(fixture.fixture.status.short);
      const isFinished = ['FT', 'AET', 'PEN'].includes(fixture.fixture.status.short);
      const cacheTTL = isLive ? this.LIVE_CACHE_TTL_MS :
                       isFinished ? this.FINISHED_CACHE_TTL_MS :
                       this.LIVE_CACHE_TTL_MS;

      const cachedAt = new Date();
      const expiresAt = Date.now() + cacheTTL;

      // Cache the result
      this.liveMatchCache.set(fixtureId, {
        data: match,
        cachedAt,
        expiresAt,
      });

      this.logger.log(`📺 Live match data fetched: ${match.homeTeam.name} ${match.homeTeam.goals}-${match.awayTeam.goals} ${match.awayTeam.name} (${match.status})`);

      return { match, cachedAt, cacheExpiresIn: Math.floor(cacheTTL / 1000) };
    } catch (error) {
      this.logger.error(`Error fetching live match ${fixtureId}: ${error.message}`);
      return { match: null, cachedAt: new Date(), cacheExpiresIn: 0 };
    }
  }

  /**
   * Get current live fixture ID for a team
   */
  async getLiveFixtureId(teamId: number): Promise<number | null> {
    if (!this.apiKey) return null;

    try {
      const response = await fetch(`${this.baseUrl}/fixtures?team=${teamId}&live=all`, {
        headers: { 'x-apisports-key': this.apiKey },
      });
      const data = await response.json();

      if (data.response?.length > 0) {
        return data.response[0].fixture.id;
      }
      return null;
    } catch (error) {
      this.logger.error(`Error fetching live fixture for team ${teamId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse API response into LiveMatchData
   */
  private parseFixtureData(
    fixture: any,
    events: any[],
    stats: any[],
    lineups: any[]
  ): LiveMatchData {
    const f = fixture.fixture;
    const teams = fixture.teams;
    const goals = fixture.goals;
    const score = fixture.score;
    const league = fixture.league;

    return {
      fixtureId: f.id,
      date: new Date(f.date),
      status: f.status.short,
      statusLong: f.status.long,
      elapsed: f.status.elapsed,
      venue: f.venue?.name,
      referee: f.referee,
      league: league.name,
      leagueLogo: league.logo,
      round: league.round,
      homeTeam: {
        id: teams.home.id,
        name: teams.home.name,
        logo: teams.home.logo,
        goals: goals.home,
        winner: teams.home.winner,
      },
      awayTeam: {
        id: teams.away.id,
        name: teams.away.name,
        logo: teams.away.logo,
        goals: goals.away,
        winner: teams.away.winner,
      },
      events: this.parseEvents(events),
      statistics: this.parseStatistics(stats),
      lineups: this.parseLineups(lineups),
      halftimeHome: score.halftime?.home,
      halftimeAway: score.halftime?.away,
      fulltimeHome: score.fulltime?.home,
      fulltimeAway: score.fulltime?.away,
    };
  }

  /**
   * Parse match events (goals, cards, substitutions)
   */
  private parseEvents(events: any[]): MatchEvent[] {
    return events.map(e => ({
      minute: e.time.elapsed,
      extraMinute: e.time.extra,
      type: e.type,
      detail: e.detail,
      playerName: e.player?.name,
      playerPhoto: e.player?.photo,
      assistName: e.assist?.name,
      teamName: e.team.name,
      teamLogo: e.team.logo,
      comments: e.comments,
    }));
  }

  /**
   * Parse match statistics
   */
  private parseStatistics(stats: any[]): MatchStatistic[] {
    if (stats.length < 2) return [];

    const homeStats = stats[0]?.statistics || [];
    const awayStats = stats[1]?.statistics || [];

    const result: MatchStatistic[] = [];
    for (let i = 0; i < homeStats.length; i++) {
      result.push({
        type: homeStats[i].type,
        home: String(homeStats[i].value ?? '0'),
        away: String(awayStats[i]?.value ?? '0'),
      });
    }
    return result;
  }

  /**
   * Parse lineups
   */
  private parseLineups(lineups: any[]): MatchLineup[] {
    return lineups.map(l => ({
      teamName: l.team.name,
      teamLogo: l.team.logo,
      formation: l.formation,
      startXI: (l.startXI || []).map((p: any) => this.parsePlayer(p.player)),
      substitutes: (l.substitutes || []).map((p: any) => this.parsePlayer(p.player)),
      coach: l.coach?.name,
    }));
  }

  /**
   * Parse player data
   */
  private parsePlayer(player: any): MatchLineupPlayer {
    return {
      id: player.id,
      name: player.name,
      number: player.number,
      pos: player.pos,
      grid: player.grid,
      photo: player.photo,
    };
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.liveMatchCache.entries()) {
      if (now > entry.expiresAt) {
        this.liveMatchCache.delete(key);
      }
    }
  }
}
