// Tool handlers for World Cup 2026 AI Chat Assistant

import { QueriesService } from '../queries/queries.service';
import { STAGES } from './constants';
import type {
  Locale,
  ToolResult,
  MatchData,
  TeamData,
  VenueData,
  GetTeamMatchesParams,
  GetMatchInfoParams,
  GetUpcomingMatchesParams,
  GetGroupInfoParams,
  GetVenueInfoParams,
  GetMatchesOnDateParams,
  ConvertMatchTimeParams,
  SearchTeamsParams,
} from './types';

function formatMatchData(
  match: ReturnType<QueriesService['getMatchById']>,
  queriesService: QueriesService,
  locale: Locale,
): MatchData | null {
  if (!match) return null;

  const homeTeam = queriesService.getTeamById(match.homeTeamId);
  const awayTeam = queriesService.getTeamById(match.awayTeamId);
  const venue = queriesService.getVenueById(match.venueId);

  if (!homeTeam || !awayTeam || !venue) return null;

  return {
    id: match.id,
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
    stage: match.stage,
    stageName: STAGES[match.stage]?.[locale] || match.stage,
    groupId: match.groupId,
    broadcasts: {
      spanish: match.broadcasts.spanish.map((b) => b.name),
      english: match.broadcasts.english.map((b) => b.name),
    },
  };
}

function formatTeamData(
  team: ReturnType<QueriesService['getTeamById']>,
  locale: Locale,
): TeamData | null {
  if (!team) return null;

  return {
    id: team.id,
    name: team.name[locale],
    code: team.code,
    flag: team.flag,
    groupId: team.groupId,
    groupName: `${locale === 'es' ? 'Grupo' : 'Group'} ${team.groupId}`,
    confederation: team.confederation,
    worldCupAppearances: team.worldCupAppearances,
    bestResult: team.bestResult?.[locale],
    isHost: team.isHost,
    qualified: team.qualified,
  };
}

export function handleGetTeamMatches(
  params: GetTeamMatchesParams,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const { teamId } = params;
    const matches = queriesService.getMatchesByTeam(teamId.toLowerCase());

    if (matches.length === 0) {
      return {
        success: false,
        error: `No matches found for team: ${teamId}`,
      };
    }

    const team = queriesService.getTeamById(teamId.toLowerCase());
    const formattedMatches = matches
      .map((m) => formatMatchData(m, queriesService, locale))
      .filter((m): m is MatchData => m !== null);

    return {
      success: true,
      data: {
        team: team ? formatTeamData(team, locale) : null,
        matches: formattedMatches,
        totalMatches: formattedMatches.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting team matches: ${error}`,
    };
  }
}

export function handleGetMatchInfo(
  params: GetMatchInfoParams,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const { matchId } = params;
    const match = queriesService.getMatchById(matchId);

    if (!match) {
      return {
        success: false,
        error: `Match not found: ${matchId}`,
      };
    }

    const formattedMatch = formatMatchData(match, queriesService, locale);

    return {
      success: true,
      data: formattedMatch,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting match info: ${error}`,
    };
  }
}

export function handleGetUpcomingMatches(
  params: GetUpcomingMatchesParams,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const limit = Math.min(params.limit || 5, 10);
    const matches = queriesService.getUpcomingMatches(limit);

    const formattedMatches = matches
      .map((m) => formatMatchData(m, queriesService, locale))
      .filter((m): m is MatchData => m !== null);

    return {
      success: true,
      data: {
        matches: formattedMatches,
        totalMatches: formattedMatches.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting upcoming matches: ${error}`,
    };
  }
}

export function handleGetGroupInfo(
  params: GetGroupInfoParams,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const { groupId } = params;
    const groupData = queriesService.getGroupWithTeams(groupId.toUpperCase(), locale);

    if (!groupData) {
      return {
        success: false,
        error: `Group not found: ${groupId}`,
      };
    }

    return {
      success: true,
      data: {
        id: groupData.id,
        name: groupData.name[locale],
        teams: groupData.teams,
        matches: groupData.matches,
        matchCount: groupData.matches.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting group info: ${error}`,
    };
  }
}

export function handleGetVenueInfo(
  params: GetVenueInfoParams,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const { venueId } = params;
    const venue = queriesService.getVenueById(venueId);

    if (!venue) {
      return {
        success: false,
        error: `Venue not found: ${venueId}`,
      };
    }

    const venueMatches = queriesService.getMatchesByVenue(venueId);

    const venueData: VenueData = {
      id: venue.id,
      name: venue.name,
      city: venue.city[locale],
      state: venue.state,
      country: venue.country,
      capacity: venue.capacity,
      timezone: venue.timezone,
      matchCount: venueMatches.length,
    };

    return {
      success: true,
      data: venueData,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting venue info: ${error}`,
    };
  }
}

export function handleGetMatchesOnDate(
  params: GetMatchesOnDateParams,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const { date } = params;
    const matches = queriesService.getMatchesByDate(date);

    const formattedMatches = matches
      .map((m) => formatMatchData(m, queriesService, locale))
      .filter((m): m is MatchData => m !== null);

    return {
      success: true,
      data: {
        date,
        matches: formattedMatches,
        totalMatches: formattedMatches.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting matches on date: ${error}`,
    };
  }
}

export function handleConvertMatchTime(
  params: ConvertMatchTimeParams,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const { matchId, timezone } = params;
    const match = queriesService.getMatchById(matchId);

    if (!match) {
      return {
        success: false,
        error: `Match not found: ${matchId}`,
      };
    }

    const homeTeam = queriesService.getTeamById(match.homeTeamId);
    const awayTeam = queriesService.getTeamById(match.awayTeamId);

    // Format date in timezone
    const matchDate = new Date(match.dateTimeUTC);
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };

    const localDate = matchDate.toLocaleDateString(
      locale === 'es' ? 'es-MX' : 'en-US',
      options,
    );
    const localTime = matchDate.toLocaleTimeString(
      locale === 'es' ? 'es-MX' : 'en-US',
      timeOptions,
    );

    return {
      success: true,
      data: {
        matchId,
        homeTeam: homeTeam?.name[locale],
        awayTeam: awayTeam?.name[locale],
        dateTimeUTC: match.dateTimeUTC,
        timezone,
        localDate,
        localTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error converting match time: ${error}`,
    };
  }
}

export function handleGetAllVenues(
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const venues = queriesService.getAllVenues();

    const venuesData = venues.map((venue) => {
      const venueMatches = queriesService.getMatchesByVenue(venue.id);
      return {
        id: venue.id,
        name: venue.name,
        city: venue.city[locale],
        state: venue.state,
        country: venue.country,
        capacity: venue.capacity,
        timezone: venue.timezone,
        matchCount: venueMatches.length,
      };
    });

    // Group by country
    const byCountry = venuesData.reduce(
      (acc, venue) => {
        if (!acc[venue.country]) {
          acc[venue.country] = [];
        }
        acc[venue.country].push(venue);
        return acc;
      },
      {} as Record<string, typeof venuesData>,
    );

    return {
      success: true,
      data: {
        venues: venuesData,
        byCountry,
        totalVenues: venuesData.length,
        totalCapacity: venuesData.reduce((sum, v) => sum + v.capacity, 0),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error getting venues: ${error}`,
    };
  }
}

export function handleSearchTeams(
  params: SearchTeamsParams,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  try {
    const { query } = params;
    const matchingTeams = queriesService.searchTeams(query);

    if (matchingTeams.length === 0) {
      return {
        success: false,
        error: `No teams found matching: ${query}`,
      };
    }

    const teamsData = matchingTeams.map((team) => formatTeamData(team, locale));

    return {
      success: true,
      data: {
        teams: teamsData,
        totalResults: teamsData.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error searching teams: ${error}`,
    };
  }
}

// Main tool execution dispatcher
export function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  queriesService: QueriesService,
  locale: Locale,
): ToolResult {
  switch (toolName) {
    case 'get_team_matches':
      return handleGetTeamMatches(
        toolInput as unknown as GetTeamMatchesParams,
        queriesService,
        locale,
      );
    case 'get_match_info':
      return handleGetMatchInfo(
        toolInput as unknown as GetMatchInfoParams,
        queriesService,
        locale,
      );
    case 'get_upcoming_matches':
      return handleGetUpcomingMatches(
        toolInput as unknown as GetUpcomingMatchesParams,
        queriesService,
        locale,
      );
    case 'get_group_info':
      return handleGetGroupInfo(
        toolInput as unknown as GetGroupInfoParams,
        queriesService,
        locale,
      );
    case 'get_venue_info':
      return handleGetVenueInfo(
        toolInput as unknown as GetVenueInfoParams,
        queriesService,
        locale,
      );
    case 'get_matches_on_date':
      return handleGetMatchesOnDate(
        toolInput as unknown as GetMatchesOnDateParams,
        queriesService,
        locale,
      );
    case 'convert_match_time':
      return handleConvertMatchTime(
        toolInput as unknown as ConvertMatchTimeParams,
        queriesService,
        locale,
      );
    case 'get_all_venues':
      return handleGetAllVenues(queriesService, locale);
    case 'search_teams':
      return handleSearchTeams(
        toolInput as unknown as SearchTeamsParams,
        queriesService,
        locale,
      );
    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
  }
}
