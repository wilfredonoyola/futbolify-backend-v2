import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService, CACHE_TTL } from '../common/redis-cache.service';
import { StandingsDto, StandingEntryDto, TeamInfoDto } from './dto/standing.dto';
import { resolveTeamLogoUrl } from './resolve-team-logo';
import * as path from 'path';
import * as fs from 'fs';

interface LeagueDataEntry {
  position: number;
  teamId: string;
  team: {
    id: string;
    name: string;
    nameEn?: string;
    code: string;
    flag?: string;
    logo?: string;
  };
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form?: string[];
  zone?: string;
}

interface LeagueData {
  leagueId: string;
  leagueName: string;
  season: string;
  conference?: string;
  entries: LeagueDataEntry[];
}

@Injectable()
export class StandingsService {
  private readonly logger = new Logger(StandingsService.name);
  private readonly dataPath = path.join(__dirname, 'data');

  constructor(private readonly cache: RedisCacheService) {}

  /**
   * Get standings for a league
   */
  async getStandings(
    leagueId: string,
    season?: string,
    conference?: string,
  ): Promise<StandingsDto | null> {
    const cacheKey = this.buildCacheKey(leagueId, season, conference);

    // 1. Check Redis cache
    const cached = await this.cache.get<StandingsDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for standings: ${cacheKey}`);
      return cached;
    }

    // 2. Fetch from static data (or API in the future)
    const data = await this.fetchStandingsData(leagueId, season, conference);

    if (!data) {
      this.logger.warn(`No standings data found for ${leagueId}`);
      return null;
    }

    // 3. Cache in Redis
    await this.cache.set(cacheKey, data, CACHE_TTL.STANDINGS);

    return data;
  }

  /**
   * Get standings for MLS (both conferences)
   */
  async getMlsStandings(season?: string): Promise<StandingsDto[]> {
    const eastern = await this.getStandings('mls', season, 'eastern');
    const western = await this.getStandings('mls', season, 'western');

    return [eastern, western].filter(Boolean) as StandingsDto[];
  }

  /**
   * Invalidate standings cache for a league
   */
  async invalidateStandings(leagueId: string): Promise<void> {
    await this.cache.deletePattern(`standings:${leagueId}:*`);
    this.logger.log(`Invalidated standings cache for ${leagueId}`);
  }

  /**
   * Build cache key for standings
   */
  private buildCacheKey(
    leagueId: string,
    season?: string,
    conference?: string,
  ): string {
    const parts = ['standings', leagueId];
    if (conference) parts.push(conference);
    parts.push(season || 'current');
    return parts.join(':');
  }

  /**
   * Load JSON data from file
   */
  private loadJsonFile(filename: string): LeagueData | null {
    try {
      const filePath = path.join(this.dataPath, filename);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to load ${filename}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch standings data from static JSON files
   * In the future, this can be extended to fetch from external APIs
   */
  private async fetchStandingsData(
    leagueId: string,
    _season?: string,
    conference?: string,
  ): Promise<StandingsDto | null> {
    let data: LeagueData | null = null;

    switch (leagueId) {
      case 'la-liga':
        data = this.loadJsonFile('la-liga.json');
        break;
      case 'premier-league':
        data = this.loadJsonFile('premier-league.json');
        break;
      case 'liga-mx':
        data = this.loadJsonFile('liga-mx.json');
        break;
      case 'mls':
        if (conference === 'eastern') {
          data = this.loadJsonFile('mls-eastern.json');
        } else if (conference === 'western') {
          data = this.loadJsonFile('mls-western.json');
        }
        break;
      case 'champions-league':
        data = this.loadJsonFile('champions-league.json');
        break;
      default:
        this.logger.warn(`Unknown league: ${leagueId}`);
        return null;
    }

    if (!data) return null;

    return {
      leagueId: data.leagueId,
      leagueName: data.leagueName,
      season: data.season,
      conference: conference || undefined,
      entries: data.entries.map((entry) => ({
        position: entry.position,
        teamId: entry.teamId,
        team: {
          id: entry.team.id,
          name: entry.team.name,
          nameEn: entry.team.nameEn,
          code: entry.team.code,
          flag: entry.team.flag,
          logo: resolveTeamLogoUrl(
            data.leagueId,
            entry.team.id,
            entry.team.logo,
          ),
        } as TeamInfoDto,
        played: entry.played,
        won: entry.won,
        drawn: entry.drawn,
        lost: entry.lost,
        goalsFor: entry.goalsFor,
        goalsAgainst: entry.goalsAgainst,
        goalDifference: entry.goalDifference,
        points: entry.points,
        form: entry.form,
        zone: entry.zone,
      })) as StandingEntryDto[],
      lastUpdated: new Date().toISOString(),
    };
  }
}
