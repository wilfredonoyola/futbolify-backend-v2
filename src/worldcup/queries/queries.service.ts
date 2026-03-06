import { Injectable, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

// Raw data types (from JSON) - exported for use in resolvers
export interface RawMatch {
  id: string;
  matchNumber: number;
  stage: string;
  groupId?: string;
  homeTeamId: string;
  awayTeamId: string;
  dateTimeUTC: string;
  venueId: string;
  broadcasts: {
    spanish: { name: string; type: string; affiliateUrl?: string; logo?: string }[];
    english: { name: string; type: string; affiliateUrl?: string; logo?: string }[];
  };
  slug: { es: string; en: string };
}

export interface RawTeam {
  id: string;
  code: string;
  name: { es: string; en: string };
  flag: string;
  groupId: string;
  confederation: string;
  qualified: boolean;
  isHost: boolean;
  worldCupAppearances?: number;
  bestResult?: { es: string; en: string };
  slug: { es: string; en: string };
}

export interface RawGroup {
  id: string;
  name: { es: string; en: string };
  teamIds: string[];
  slug: { es: string; en: string };
}

export interface RawVenue {
  id: string;
  name: string;
  city: { es: string; en: string };
  state: string;
  country: string;
  capacity: number;
  timezone: string;
  coordinates: { lat: number; lng: number };
  image?: string;
}

export interface RawBroadcast {
  id: string;
  name: string;
  type: string;
  languages: string[];
  affiliateUrl: string;
  monthlyPrice?: number;
  annualPrice?: number;
  logo: string;
  matchCount: number;
}

// Stage name mappings
const STAGE_NAMES: Record<string, { es: string; en: string }> = {
  group: { es: 'Fase de Grupos', en: 'Group Stage' },
  round32: { es: 'Dieciseisavos de Final', en: 'Round of 32' },
  round16: { es: 'Octavos de Final', en: 'Round of 16' },
  quarterfinal: { es: 'Cuartos de Final', en: 'Quarter-finals' },
  semifinal: { es: 'Semifinales', en: 'Semi-finals' },
  third: { es: 'Tercer Puesto', en: 'Third Place' },
  final: { es: 'Final', en: 'Final' },
};

@Injectable()
export class QueriesService implements OnModuleInit {
  private matches: RawMatch[] = [];
  private teams: RawTeam[] = [];
  private groups: RawGroup[] = [];
  private venues: RawVenue[] = [];
  private broadcasts: RawBroadcast[] = [];

  onModuleInit() {
    this.loadData();
  }

  private loadData() {
    const dataPath = path.join(__dirname, '..', 'data');

    this.matches = JSON.parse(
      fs.readFileSync(path.join(dataPath, 'matches.json'), 'utf-8'),
    );
    this.teams = JSON.parse(
      fs.readFileSync(path.join(dataPath, 'teams.json'), 'utf-8'),
    );
    this.groups = JSON.parse(
      fs.readFileSync(path.join(dataPath, 'groups.json'), 'utf-8'),
    );
    this.venues = JSON.parse(
      fs.readFileSync(path.join(dataPath, 'venues.json'), 'utf-8'),
    );
    this.broadcasts = JSON.parse(
      fs.readFileSync(path.join(dataPath, 'broadcasts.json'), 'utf-8'),
    );

    console.log(
      `[WorldCup] Loaded: ${this.matches.length} matches, ${this.teams.length} teams, ${this.groups.length} groups, ${this.venues.length} venues`,
    );
  }

  // ============ MATCH QUERIES ============

  getAllMatches(): RawMatch[] {
    return this.matches;
  }

  getMatchById(id: string): RawMatch | undefined {
    return this.matches.find((m) => m.id === id);
  }

  getMatchesByTeam(teamId: string): RawMatch[] {
    return this.matches.filter(
      (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
    );
  }

  getMatchesByStage(stage: string): RawMatch[] {
    return this.matches.filter((m) => m.stage === stage);
  }

  getMatchesByGroup(groupId: string): RawMatch[] {
    return this.matches.filter((m) => m.groupId === groupId);
  }

  getMatchesByDate(date: string): RawMatch[] {
    return this.matches.filter((m) => m.dateTimeUTC.startsWith(date));
  }

  getMatchesByVenue(venueId: string): RawMatch[] {
    return this.matches.filter((m) => m.venueId === venueId);
  }

  getUpcomingMatches(limit: number = 5): RawMatch[] {
    const now = new Date();
    return this.matches
      .filter((m) => new Date(m.dateTimeUTC) > now)
      .sort(
        (a, b) =>
          new Date(a.dateTimeUTC).getTime() - new Date(b.dateTimeUTC).getTime(),
      )
      .slice(0, limit);
  }

  // ============ TEAM QUERIES ============

  getAllTeams(): RawTeam[] {
    return this.teams;
  }

  getTeamById(id: string): RawTeam | undefined {
    return this.teams.find((t) => t.id === id);
  }

  getTeamByCode(code: string): RawTeam | undefined {
    return this.teams.find((t) => t.code.toLowerCase() === code.toLowerCase());
  }

  getTeamsByGroup(groupId: string): RawTeam[] {
    return this.teams.filter((t) => t.groupId === groupId);
  }

  getTeamsByConfederation(confederation: string): RawTeam[] {
    return this.teams.filter((t) => t.confederation === confederation);
  }

  getHostTeams(): RawTeam[] {
    return this.teams.filter((t) => t.isHost);
  }

  // ============ GROUP QUERIES ============

  getAllGroups(): RawGroup[] {
    return this.groups;
  }

  getGroupById(id: string): RawGroup | undefined {
    return this.groups.find((g) => g.id === id);
  }

  // ============ VENUE QUERIES ============

  getAllVenues(): RawVenue[] {
    return this.venues;
  }

  getVenueById(id: string): RawVenue | undefined {
    return this.venues.find((v) => v.id === id);
  }

  getVenuesByCountry(country: string): RawVenue[] {
    return this.venues.filter((v) => v.country === country);
  }

  // ============ BROADCAST QUERIES ============

  getAllBroadcasts(): RawBroadcast[] {
    return this.broadcasts;
  }

  // ============ ENRICHED QUERIES ============

  getMatchWithTeams(matchId: string, locale: 'es' | 'en' = 'es') {
    const match = this.getMatchById(matchId);
    if (!match) return null;

    const homeTeam = this.getTeamById(match.homeTeamId);
    const awayTeam = this.getTeamById(match.awayTeamId);
    const venue = this.getVenueById(match.venueId);

    if (!homeTeam || !awayTeam || !venue) return null;

    return {
      id: match.id,
      matchNumber: match.matchNumber,
      stage: match.stage,
      stageName: STAGE_NAMES[match.stage]?.[locale] || match.stage,
      groupId: match.groupId,
      homeTeam: {
        id: homeTeam.id,
        name: homeTeam.name[locale],
        code: homeTeam.code,
        flag: homeTeam.flag,
      },
      awayTeam: {
        id: awayTeam.id,
        name: awayTeam.name[locale],
        code: awayTeam.code,
        flag: awayTeam.flag,
      },
      dateTimeUTC: match.dateTimeUTC,
      venue: {
        id: venue.id,
        name: venue.name,
        city: venue.city[locale],
        country: venue.country,
      },
      broadcasts: match.broadcasts,
    };
  }

  getTeamMatches(teamId: string, locale: 'es' | 'en' = 'es') {
    const team = this.getTeamById(teamId);
    if (!team) return null;

    const matches = this.getMatchesByTeam(teamId);
    const enrichedMatches = matches.map((m) => this.getMatchWithTeams(m.id, locale)).filter(Boolean);

    return {
      team: {
        id: team.id,
        name: team.name[locale],
        code: team.code,
        flag: team.flag,
      },
      matches: enrichedMatches,
    };
  }

  getGroupWithTeams(groupId: string, locale: 'es' | 'en' = 'es') {
    const group = this.getGroupById(groupId);
    if (!group) return null;

    const teams = this.getTeamsByGroup(groupId);
    const matches = this.getMatchesByGroup(groupId);
    const enrichedMatches = matches.map((m) => this.getMatchWithTeams(m.id, locale)).filter(Boolean);

    return {
      id: group.id,
      name: group.name,
      teams: teams,
      matches: enrichedMatches,
      slug: group.slug,
    };
  }

  getUpcomingMatchesWithTeams(limit: number = 5, locale: 'es' | 'en' = 'es') {
    const upcoming = this.getUpcomingMatches(limit);
    return upcoming.map((m) => this.getMatchWithTeams(m.id, locale)).filter(Boolean);
  }

  // ============ SEARCH ============

  searchTeams(query: string): RawTeam[] {
    const q = query.toLowerCase();
    return this.teams.filter(
      (t) =>
        t.name.es.toLowerCase().includes(q) ||
        t.name.en.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q),
    );
  }
}
