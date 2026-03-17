// Tool handlers for Football Chat
// Executes tool calls made by Claude and returns structured data
// Supports Mundial 2026 (via QueriesService) and other leagues (via ApiFootball)

import { ApiFootballAdapter } from './adapters/api-football.adapter';
import { QueriesService } from '../../worldcup/queries/queries.service';
import { Locale, FOOTBALL_LEAGUE_IDS, isStaticLeague } from './types';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_team_matches':
      return handleGetTeamMatches(input, adapter, queriesService, locale);

    case 'get_league_matches':
      return handleGetLeagueMatches(input, adapter, queriesService, locale);

    case 'get_standings':
      return handleGetStandings(input, adapter, queriesService, locale);

    case 'get_live_scores':
      return handleGetLiveScores(input, adapter, locale);

    case 'search_team':
      return handleSearchTeam(input, adapter, queriesService, locale);

    case 'get_head_to_head':
      return handleGetHeadToHead(input, adapter, locale);

    case 'get_match_info':
      return handleGetMatchInfo(input, adapter, queriesService, locale);

    case 'get_top_scorers':
      return handleGetTopScorers(input, adapter, locale);

    // Mundial 2026 specific tools
    case 'get_group_info':
      return handleGetGroupInfo(input, queriesService, locale);

    case 'get_venue_info':
      return handleGetVenueInfo(input, queriesService, locale);

    case 'get_all_venues':
      return handleGetAllVenues(queriesService, locale);

    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
  }
}

async function handleGetTeamMatches(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  const teamName = input.teamName as string;
  const leagueId = input.leagueId as string | undefined;

  if (!teamName) {
    return { success: false, error: 'teamName is required' };
  }

  console.log(`[TOOL] get_team_matches: team=${teamName}, league=${leagueId || 'auto'}`);

  try {
    // Check if this is a national team that might be in World Cup
    const wcTeams = queriesService.searchTeams(teamName);
    const isNationalTeam = wcTeams.length > 0;

    // If Mundial 2026 explicitly OR national team without specific league
    if (leagueId === 'mundial-2026' || (isNationalTeam && !leagueId)) {
      // Try to find team in World Cup data
      if (wcTeams.length > 0) {
        const team = wcTeams[0];
        const wcMatches = queriesService.getMatchesByTeam(team.id);
        console.log(`[TOOL] Found ${wcMatches.length} World Cup matches for ${team.name.es}`);

        if (wcMatches.length > 0) {
          const now = new Date();
          return {
            success: true,
            data: {
              team: team.name[locale],
              teamId: team.id,
              flag: team.flag,
              code: team.code,
              isWorldCup: true,
              matches: wcMatches.slice(0, 10).map((m) => {
                const homeTeam = queriesService.getTeamById(m.homeTeamId);
                const awayTeam = queriesService.getTeamById(m.awayTeamId);
                const venue = queriesService.getVenueById(m.venueId);
                return {
                  id: m.id,
                  homeTeam: {
                    id: homeTeam?.id,
                    name: homeTeam?.name[locale],
                    code: homeTeam?.code,
                    flag: homeTeam?.flag,
                  },
                  awayTeam: {
                    id: awayTeam?.id,
                    name: awayTeam?.name[locale],
                    code: awayTeam?.code,
                    flag: awayTeam?.flag,
                  },
                  date: m.dateTimeUTC,
                  venue: venue?.name,
                  city: venue?.city[locale],
                  stage: m.stage,
                  groupId: m.groupId,
                  status: new Date(m.dateTimeUTC) > now ? 'scheduled' : 'finished',
                };
              }),
            },
          };
        }
      }
    }

    // Use API-Football for club teams or when World Cup has no matches
    console.log(`[TOOL] Fetching from API-Football for ${teamName}...`);
    const matches = await adapter.getTeamMatches(teamName, leagueId);
    console.log(`[TOOL] API-Football returned ${matches.length} matches for ${teamName}`);

    if (matches.length === 0) {
      return {
        success: true,
        data: {
          message:
            locale === 'es'
              ? `No encontré partidos próximos para ${teamName}. Intenta buscar un equipo específico o pregunta por una liga.`
              : `No upcoming matches found for ${teamName}. Try searching for a specific team or ask about a league.`,
          matches: [],
        },
      };
    }

    const now = new Date();
    const upcoming = matches.filter((m) => new Date(m.date) >= now);
    const recent = matches.filter((m) => new Date(m.date) < now);

    return {
      success: true,
      data: {
        team: teamName,
        upcoming: upcoming.slice(0, 5),
        recent: recent.slice(0, 3),
        matches: upcoming.slice(0, 5),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching team matches: ${error.message}`,
    };
  }
}

async function handleGetLeagueMatches(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  const leagueId = input.leagueId as string;
  const date = input.date as string | undefined;

  if (!leagueId) {
    return { success: false, error: 'leagueId is required' };
  }

  const leagueConfig = FOOTBALL_LEAGUE_IDS[leagueId];
  if (!leagueConfig) {
    return {
      success: false,
      error: `Unknown league: ${leagueId}. Available: ${Object.keys(FOOTBALL_LEAGUE_IDS).join(', ')}`,
    };
  }

  try {
    // Mundial 2026 - use static data
    if (isStaticLeague(leagueId)) {
      let wcMatches = queriesService.getAllMatches();

      // Filter by date if provided
      if (date) {
        wcMatches = wcMatches.filter((m) => m.dateTimeUTC.startsWith(date));
      } else {
        // Default: upcoming matches
        const now = new Date();
        wcMatches = wcMatches
          .filter((m) => new Date(m.dateTimeUTC) >= now)
          .slice(0, 15);
      }

      return {
        success: true,
        data: {
          league: leagueConfig.name[locale],
          leagueId,
          isWorldCup: true,
          matches: wcMatches.map((m) => {
            const homeTeam = queriesService.getTeamById(m.homeTeamId);
            const awayTeam = queriesService.getTeamById(m.awayTeamId);
            const venue = queriesService.getVenueById(m.venueId);
            return {
              id: m.id,
              homeTeam: {
                id: homeTeam?.id,
                name: homeTeam?.name[locale],
                code: homeTeam?.code,
                flag: homeTeam?.flag,
              },
              awayTeam: {
                id: awayTeam?.id,
                name: awayTeam?.name[locale],
                code: awayTeam?.code,
                flag: awayTeam?.flag,
              },
              date: m.dateTimeUTC,
              venue: venue?.name,
              city: venue?.city[locale],
              stage: m.stage,
              groupId: m.groupId,
            };
          }),
          total: wcMatches.length,
        },
      };
    }

    // Other leagues - use API-Football
    const matches = await adapter.getLeagueMatches(leagueId, date);

    return {
      success: true,
      data: {
        league: leagueConfig.name[locale],
        leagueId,
        matches: matches.slice(0, 10),
        total: matches.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching league matches: ${error.message}`,
    };
  }
}

async function handleGetStandings(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  const leagueId = input.leagueId as string;

  if (!leagueId) {
    return { success: false, error: 'leagueId is required' };
  }

  const leagueConfig = FOOTBALL_LEAGUE_IDS[leagueId];
  if (!leagueConfig) {
    return {
      success: false,
      error: `Unknown league: ${leagueId}`,
    };
  }

  try {
    // Mundial 2026 - return group standings
    if (isStaticLeague(leagueId)) {
      const groups = queriesService.getAllGroups();

      return {
        success: true,
        data: {
          league: leagueConfig.name[locale],
          leagueId,
          isWorldCup: true,
          type: 'groups',
          groups: groups.map((g) => ({
            id: g.id,
            name: `${locale === 'es' ? 'Grupo' : 'Group'} ${g.id.toUpperCase()}`,
            teams: g.teamIds.map((teamId) => {
              const team = queriesService.getTeamById(teamId);
              return {
                id: team?.id,
                name: team?.name[locale],
                code: team?.code,
                flag: team?.flag,
              };
            }),
          })),
        },
      };
    }

    // Other leagues - use API-Football
    const standings = await adapter.getStandings(leagueId);

    return {
      success: true,
      data: {
        league: leagueConfig.name[locale],
        leagueId,
        standings: standings.slice(0, 20),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching standings: ${error.message}`,
    };
  }
}

async function handleGetLiveScores(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  locale: Locale,
): Promise<ToolResult> {
  const leagueId = input.leagueId as string | undefined;

  try {
    const liveMatches = await adapter.getLiveScores(leagueId);

    if (liveMatches.length === 0) {
      return {
        success: true,
        data: {
          message:
            locale === 'es'
              ? 'No hay partidos en vivo en este momento'
              : 'No live matches at the moment',
          matches: [],
        },
      };
    }

    return {
      success: true,
      data: {
        count: liveMatches.length,
        matches: liveMatches,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching live scores: ${error.message}`,
    };
  }
}

async function handleSearchTeam(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  const query = input.query as string;

  if (!query) {
    return { success: false, error: 'query is required' };
  }

  try {
    // First search in World Cup teams
    const wcTeams = queriesService.searchTeams(query);
    if (wcTeams.length > 0) {
      return {
        success: true,
        data: {
          found: true,
          source: 'mundial-2026',
          teams: wcTeams.slice(0, 5).map((t) => ({
            id: t.id,
            name: t.name[locale],
            code: t.code,
            flag: t.flag,
            groupId: t.groupId,
          })),
        },
      };
    }

    // Otherwise search via API
    const teamId = await adapter.searchTeam(query);

    if (!teamId) {
      return {
        success: true,
        data: {
          found: false,
          message: `No team found matching "${query}"`,
        },
      };
    }

    return {
      success: true,
      data: {
        found: true,
        teamId,
        query,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error searching team: ${error.message}`,
    };
  }
}

async function handleGetHeadToHead(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  locale: Locale,
): Promise<ToolResult> {
  const team1 = input.team1 as string;
  const team2 = input.team2 as string;

  if (!team1 || !team2) {
    return { success: false, error: 'team1 and team2 are required' };
  }

  try {
    const h2h = await adapter.getHeadToHead(team1, team2);

    if (!h2h) {
      return {
        success: true,
        data: {
          message:
            locale === 'es'
              ? `No encontre historial entre ${team1} y ${team2}`
              : `No history found between ${team1} and ${team2}`,
        },
      };
    }

    return {
      success: true,
      data: h2h,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching H2H: ${error.message}`,
    };
  }
}

async function handleGetMatchInfo(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  const matchId = input.matchId as string | undefined;
  const homeTeam = input.homeTeam as string | undefined;
  const awayTeam = input.awayTeam as string | undefined;

  // Try to find in World Cup data first
  if (matchId) {
    const wcMatch = queriesService.getMatchById(matchId);
    if (wcMatch) {
      const home = queriesService.getTeamById(wcMatch.homeTeamId);
      const away = queriesService.getTeamById(wcMatch.awayTeamId);
      const venue = queriesService.getVenueById(wcMatch.venueId);

      return {
        success: true,
        data: {
          isWorldCup: true,
          match: {
            id: wcMatch.id,
            homeTeam: {
              id: home?.id,
              name: home?.name[locale],
              code: home?.code,
              flag: home?.flag,
            },
            awayTeam: {
              id: away?.id,
              name: away?.name[locale],
              code: away?.code,
              flag: away?.flag,
            },
            date: wcMatch.dateTimeUTC,
            venue: venue?.name,
            city: venue?.city[locale],
            stage: wcMatch.stage,
            groupId: wcMatch.groupId,
            broadcasts: wcMatch.broadcasts,
          },
        },
      };
    }
  }

  // If home/away teams provided, search for the match
  if (homeTeam && awayTeam) {
    // Try World Cup first
    const allWcMatches = queriesService.getAllMatches();
    const wcMatch = allWcMatches.find((m) => {
      const home = queriesService.getTeamById(m.homeTeamId);
      const away = queriesService.getTeamById(m.awayTeamId);
      const homeName = home?.name.es?.toLowerCase() || home?.name.en?.toLowerCase() || '';
      const awayName = away?.name.es?.toLowerCase() || away?.name.en?.toLowerCase() || '';
      return (
        homeName.includes(homeTeam.toLowerCase()) &&
        awayName.includes(awayTeam.toLowerCase())
      );
    });

    if (wcMatch) {
      const home = queriesService.getTeamById(wcMatch.homeTeamId);
      const away = queriesService.getTeamById(wcMatch.awayTeamId);
      const venue = queriesService.getVenueById(wcMatch.venueId);

      return {
        success: true,
        data: {
          isWorldCup: true,
          match: {
            id: wcMatch.id,
            homeTeam: {
              id: home?.id,
              name: home?.name[locale],
              code: home?.code,
              flag: home?.flag,
            },
            awayTeam: {
              id: away?.id,
              name: away?.name[locale],
              code: away?.code,
              flag: away?.flag,
            },
            date: wcMatch.dateTimeUTC,
            venue: venue?.name,
            city: venue?.city[locale],
            stage: wcMatch.stage,
            groupId: wcMatch.groupId,
            broadcasts: wcMatch.broadcasts,
          },
        },
      };
    }

    // Try API-Football
    const matches = await adapter.getTeamMatches(homeTeam);
    const match = matches.find(
      (m) =>
        m.awayTeam.name.toLowerCase().includes(awayTeam.toLowerCase()) ||
        m.homeTeam.name.toLowerCase().includes(homeTeam.toLowerCase()),
    );

    if (match) {
      return {
        success: true,
        data: {
          match,
          broadcasts: [],
        },
      };
    }
  }

  return {
    success: false,
    error: 'Match not found. Please provide matchId or both homeTeam and awayTeam.',
  };
}

async function handleGetTopScorers(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  locale: Locale,
): Promise<ToolResult> {
  const leagueId = input.leagueId as string;
  const limit = (input.limit as number) || 10;

  if (!leagueId) {
    return { success: false, error: 'leagueId is required' };
  }

  // Mundial 2026 - no top scorers before tournament
  if (isStaticLeague(leagueId)) {
    return {
      success: true,
      data: {
        message:
          locale === 'es'
            ? 'Los goleadores del Mundial 2026 estaran disponibles cuando comience el torneo'
            : 'World Cup 2026 top scorers will be available when the tournament starts',
        scorers: [],
      },
    };
  }

  const leagueConfig = FOOTBALL_LEAGUE_IDS[leagueId];
  if (!leagueConfig) {
    return { success: false, error: `Unknown league: ${leagueId}` };
  }

  try {
    const scorers = await adapter.getTopScorers(leagueId, limit);

    return {
      success: true,
      data: {
        league: leagueConfig.name[locale],
        leagueId,
        scorers,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Error fetching top scorers: ${error.message}`,
    };
  }
}

// Mundial 2026 specific handlers

function handleGetGroupInfo(
  input: Record<string, unknown>,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  const groupId = (input.groupId as string)?.toUpperCase();

  if (!groupId) {
    return Promise.resolve({ success: false, error: 'groupId is required' });
  }

  const group = queriesService.getGroupById(groupId.toLowerCase());
  if (!group) {
    return Promise.resolve({
      success: false,
      error: `Group ${groupId} not found`,
    });
  }

  const teams = group.teamIds.map((teamId) => {
    const team = queriesService.getTeamById(teamId);
    return {
      id: team?.id,
      name: team?.name[locale],
      code: team?.code,
      flag: team?.flag,
      confederation: team?.confederation,
    };
  });

  const matches = queriesService.getMatchesByGroup(groupId.toLowerCase());
  const matchesData = matches.map((m) => {
    const homeTeam = queriesService.getTeamById(m.homeTeamId);
    const awayTeam = queriesService.getTeamById(m.awayTeamId);
    const venue = queriesService.getVenueById(m.venueId);
    return {
      id: m.id,
      homeTeam: { name: homeTeam?.name[locale], flag: homeTeam?.flag },
      awayTeam: { name: awayTeam?.name[locale], flag: awayTeam?.flag },
      date: m.dateTimeUTC,
      venue: venue?.name,
    };
  });

  return Promise.resolve({
    success: true,
    data: {
      id: group.id,
      name: `${locale === 'es' ? 'Grupo' : 'Group'} ${groupId}`,
      teams,
      matches: matchesData,
      matchCount: matches.length,
    },
  });
}

function handleGetVenueInfo(
  input: Record<string, unknown>,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  const venueId = input.venueId as string;

  if (!venueId) {
    return Promise.resolve({ success: false, error: 'venueId is required' });
  }

  const venue = queriesService.getVenueById(venueId);
  if (!venue) {
    return Promise.resolve({
      success: false,
      error: `Venue ${venueId} not found`,
    });
  }

  // Get matches at this venue
  const allMatches = queriesService.getAllMatches();
  const venueMatches = allMatches.filter((m) => m.venueId === venueId);

  return Promise.resolve({
    success: true,
    data: {
      id: venue.id,
      name: venue.name,
      city: venue.city[locale],
      state: venue.state,
      country: venue.country,
      capacity: venue.capacity,
      timezone: venue.timezone,
      matchCount: venueMatches.length,
      upcomingMatches: venueMatches.slice(0, 5).map((m) => {
        const homeTeam = queriesService.getTeamById(m.homeTeamId);
        const awayTeam = queriesService.getTeamById(m.awayTeamId);
        return {
          id: m.id,
          homeTeam: { name: homeTeam?.name[locale], flag: homeTeam?.flag },
          awayTeam: { name: awayTeam?.name[locale], flag: awayTeam?.flag },
          date: m.dateTimeUTC,
          stage: m.stage,
        };
      }),
    },
  });
}

function handleGetAllVenues(
  queriesService: QueriesService,
  locale: Locale,
): Promise<ToolResult> {
  const venues = queriesService.getAllVenues();
  const allMatches = queriesService.getAllMatches();

  return Promise.resolve({
    success: true,
    data: {
      venues: venues.map((v) => ({
        id: v.id,
        name: v.name,
        city: v.city[locale],
        state: v.state,
        country: v.country,
        capacity: v.capacity,
        matchCount: allMatches.filter((m) => m.venueId === v.id).length,
      })),
      total: venues.length,
    },
  });
}
