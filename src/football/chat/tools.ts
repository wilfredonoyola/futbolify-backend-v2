// Tool definitions for Universal Football Chat - Claude Anthropic format
// Supports all leagues + Mundial 2026 + Quinielas

import Anthropic from '@anthropic-ai/sdk';

/**
 * Query tools - for fetching data from football APIs
 * Mundial 2026 uses static data, other leagues use API-Football
 */
export const queryTools: Anthropic.Tool[] = [
  {
    name: 'get_team_matches',
    description:
      "Get upcoming and recent matches for a specific team. Use this when the user asks about a team's schedule, games, or when they play next. Works for any league including Mundial 2026.",
    input_schema: {
      type: 'object' as const,
      properties: {
        teamName: {
          type: 'string',
          description:
            "The team name (e.g., 'Real Madrid', 'Barcelona', 'Mexico', 'Argentina', 'America', 'Chivas')",
        },
        leagueId: {
          type: 'string',
          description:
            "Optional league ID to filter matches (e.g., 'la-liga', 'premier-league', 'liga-mx', 'mundial-2026')",
        },
      },
      required: ['teamName'],
    },
  },
  {
    name: 'get_league_matches',
    description:
      "Get matches for a specific league on a date range. Use this when the user asks about matches in a league, like 'partidos de La Liga', 'Premier League this weekend', 'partidos del Mundial', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        leagueId: {
          type: 'string',
          description:
            "League ID: 'la-liga', 'premier-league', 'champions-league', 'liga-mx', 'bundesliga', 'serie-a', 'mls', 'mundial-2026'",
        },
        date: {
          type: 'string',
          description: "Optional date in YYYY-MM-DD format. Defaults to today and next few days.",
        },
      },
      required: ['leagueId'],
    },
  },
  {
    name: 'get_standings',
    description:
      "Get the current standings/table for a league. Use this when the user asks about 'tabla de posiciones', 'standings', 'who's leading', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        leagueId: {
          type: 'string',
          description:
            "League ID: 'la-liga', 'premier-league', 'champions-league', 'liga-mx', 'bundesliga', 'serie-a', 'mls'",
        },
      },
      required: ['leagueId'],
    },
  },
  {
    name: 'get_live_scores',
    description:
      "Get current live scores across all leagues or for a specific league. Use this when the user asks 'what games are on now', 'live scores', 'marcadores en vivo', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        leagueId: {
          type: 'string',
          description: "Optional league ID to filter. If not provided, returns all live matches.",
        },
      },
      required: [],
    },
  },
  {
    name: 'search_team',
    description:
      "Search for a team by name to get their ID and basic info. Use this when you need to find a team but the user's input might be ambiguous.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: "Search query - team name or alias (e.g., 'Barca', 'United', 'Aguilas')",
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_head_to_head',
    description:
      "Get the head-to-head history between two teams. Use this when the user asks about historical matchups, 'historial', 'who usually wins', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        team1: {
          type: 'string',
          description: 'First team name',
        },
        team2: {
          type: 'string',
          description: 'Second team name',
        },
      },
      required: ['team1', 'team2'],
    },
  },
  {
    name: 'get_match_info',
    description:
      "Get detailed information about a specific match including broadcasts. Use this when the user asks about a specific game, 'donde ver', 'what channel', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: {
          type: 'string',
          description: 'The match ID',
        },
        homeTeam: {
          type: 'string',
          description: 'Home team name (alternative to matchId)',
        },
        awayTeam: {
          type: 'string',
          description: 'Away team name (alternative to matchId)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_top_scorers',
    description:
      "Get the top scorers for a league. Use when user asks about 'goleadores', 'who's leading in goals', 'top scorers', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        leagueId: {
          type: 'string',
          description: "League ID",
        },
        limit: {
          type: 'number',
          description: 'Number of top scorers to return (default: 10)',
        },
      },
      required: ['leagueId'],
    },
  },
  // Mundial 2026 specific tools
  {
    name: 'get_group_info',
    description:
      "Get information about a World Cup 2026 group including teams and matches. Use this when the user asks about 'Grupo A', 'Group B', 'groups del mundial', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        groupId: {
          type: 'string',
          description: 'The group ID (A, B, C, D, E, F, G, H, I, J, K, L)',
        },
      },
      required: ['groupId'],
    },
  },
  {
    name: 'get_venue_info',
    description:
      "Get information about a World Cup 2026 venue/stadium. Use when user asks about 'estadio', 'venue', 'MetLife', 'Azteca', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        venueId: {
          type: 'string',
          description: "The venue ID (e.g., 'metlife', 'azteca', 'sofi', 'rose-bowl')",
        },
      },
      required: ['venueId'],
    },
  },
  {
    name: 'get_all_venues',
    description:
      "Get all World Cup 2026 venues/stadiums. Use when user asks about host cities, all stadiums, where the World Cup will be played.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

/**
 * Action tools - for executing actions that generate artifacts
 * Includes quiniela tools for prediction pools
 */
export const actionTools: Anthropic.Tool[] = [
  {
    name: 'add_to_calendar',
    description:
      "Generate a downloadable .ics calendar file for a match or team's schedule. Use this when the user wants to add matches to their calendar, says 'agregar al calendario', 'remind me', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: {
          type: 'string',
          description: 'Single match ID to add',
        },
        teamName: {
          type: 'string',
          description: "Team name to add all their upcoming matches",
        },
        leagueId: {
          type: 'string',
          description: "League ID for context (mundial-2026, la-liga, etc.)",
        },
        title: {
          type: 'string',
          description: 'Custom title for the calendar event',
        },
      },
      required: [],
    },
  },
  {
    name: 'set_reminder',
    description:
      "Set a reminder for a specific match. Use when the user wants to be notified before a match, says 'recordame', 'notify me', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: {
          type: 'string',
          description: 'Match ID to set reminder for',
        },
        minutesBefore: {
          type: 'number',
          description: 'Minutes before match to remind (15, 30, or 60). Default is 30.',
        },
      },
      required: ['matchId'],
    },
  },
  {
    name: 'generate_share_image',
    description:
      "Generate a shareable image for social media with match info or standings. Use when user wants to share, says 'compartir', 'share this', etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['match', 'standings', 'team_schedule', 'prediction'],
          description: 'Type of image to generate',
        },
        matchId: {
          type: 'string',
          description: 'Match ID for match images',
        },
        leagueId: {
          type: 'string',
          description: 'League ID for standings images',
        },
        teamName: {
          type: 'string',
          description: 'Team name for schedule images',
        },
      },
      required: ['type'],
    },
  },
  // Quiniela tools
  {
    name: 'create_quiniela',
    description:
      "Create a new prediction pool (quiniela) for matches. Use this when the user mentions 'quiniela', 'pool', 'betting pool', or wants to create predictions with friends. Works for any league or World Cup.",
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: "Name of the quiniela/pool (e.g., 'La Quiniela de Juan', 'Premier League Pool')",
        },
        ownerName: {
          type: 'string',
          description: 'Name of the pool creator (defaults to "Anonimo")',
        },
        isPrivate: {
          type: 'boolean',
          description: 'Whether the pool is private (invite-only) or public',
        },
        leagueId: {
          type: 'string',
          description: "Optional league ID to associate the quiniela with (e.g., 'mundial-2026', 'la-liga')",
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'save_prediction',
    description:
      "Save a match prediction for the user. Use this when the user says 'mi predicción es...', 'creo que gana...', 'va a quedar 3-0', etc. Can save either a simple prediction (home/draw/away) or an exact score prediction.",
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: {
          type: 'string',
          description: 'The match ID to predict',
        },
        homeTeamName: {
          type: 'string',
          description: 'Home team name (for finding the match if matchId not provided)',
        },
        awayTeamName: {
          type: 'string',
          description: 'Away team name (for finding the match if matchId not provided)',
        },
        simplePrediction: {
          type: 'string',
          enum: ['home', 'draw', 'away'],
          description: 'Simple prediction: home team wins, draw, or away team wins',
        },
        homeScore: {
          type: 'number',
          description: 'Exact score prediction for home team (0-10)',
        },
        awayScore: {
          type: 'number',
          description: 'Exact score prediction for away team (0-10)',
        },
      },
      required: ['simplePrediction'],
    },
  },
  {
    name: 'generate_bracket_share',
    description:
      "Generate a shareable World Cup bracket/prediction image. Use this when the user makes a prediction about the champion or wants to share their bracket. Only for Mundial 2026.",
    input_schema: {
      type: 'object' as const,
      properties: {
        championId: {
          type: 'string',
          description: 'Team ID of the predicted champion',
        },
        runnerUpId: {
          type: 'string',
          description: 'Team ID of the predicted runner-up (optional)',
        },
        userName: {
          type: 'string',
          description: 'Name to display on the prediction image',
        },
      },
      required: ['championId'],
    },
  },
];

// Combined tools for Claude API
export const allFootballTools: Anthropic.Tool[] = [...queryTools, ...actionTools];

// Set of action tool names for quick lookup
export const ACTION_TOOL_NAMES = new Set([
  'add_to_calendar',
  'set_reminder',
  'generate_share_image',
  'create_quiniela',
  'save_prediction',
  'generate_bracket_share',
]);
