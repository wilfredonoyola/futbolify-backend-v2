// Tool definitions for World Cup 2026 Chat - Claude Anthropic format

import Anthropic from '@anthropic-ai/sdk';

// Query tools - for fetching data
export const queryTools: Anthropic.Tool[] = [
  {
    name: 'get_team_matches',
    description:
      "Get all matches for a specific team. Use this when the user asks about a team's schedule, games, or when they play. The teamId should be the lowercase country code (e.g., 'mex' for Mexico, 'usa' for USA, 'arg' for Argentina).",
    input_schema: {
      type: 'object' as const,
      properties: {
        teamId: {
          type: 'string',
          description:
            "The team ID (lowercase country code, e.g., 'mex', 'usa', 'arg', 'bra', 'esp', 'ger')",
        },
      },
      required: ['teamId'],
    },
  },
  {
    name: 'get_match_info',
    description:
      'Get detailed information about a specific match by its ID. Use this when the user asks about a specific match.',
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: {
          type: 'string',
          description: 'The unique match ID',
        },
      },
      required: ['matchId'],
    },
  },
  {
    name: 'get_upcoming_matches',
    description:
      "Get the next upcoming matches. Use this when the user asks about upcoming games, next matches, or what's coming up.",
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of matches to return (default: 5, max: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_group_info',
    description:
      "Get information about a specific group including teams and matches. Use this when the user asks about a group (e.g., 'Group A', 'Grupo B'). The groupId should be a single letter (A-L).",
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
      'Get information about a specific venue/stadium. Use this when the user asks about a stadium or venue.',
    input_schema: {
      type: 'object' as const,
      properties: {
        venueId: {
          type: 'string',
          description: "The venue ID (e.g., 'metlife', 'azteca', 'sofi')",
        },
      },
      required: ['venueId'],
    },
  },
  {
    name: 'get_matches_on_date',
    description:
      'Get all matches scheduled for a specific date. Use this when the user asks about matches on a particular day.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string',
          description: "The date in YYYY-MM-DD format (e.g., '2026-06-11')",
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'convert_match_time',
    description:
      'Convert a match time to a specific timezone. Use this when the user asks about match times in different timezones.',
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: {
          type: 'string',
          description: 'The unique match ID',
        },
        timezone: {
          type: 'string',
          description:
            "The timezone to convert to (e.g., 'America/New_York', 'America/Los_Angeles', 'America/Mexico_City')",
        },
      },
      required: ['matchId', 'timezone'],
    },
  },
  {
    name: 'get_all_venues',
    description:
      'Get a list of all World Cup 2026 venues/stadiums. Use this when the user asks about stadiums, venues, host cities, or where matches will be played.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_teams',
    description:
      "Search for teams by name or country code. Use this when you need to find a team but don't know the exact ID, or when the user mentions a team by name.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            "Search query - team name or country code (e.g., 'Mexico', 'Argentina', 'MEX', 'ARG')",
        },
      },
      required: ['query'],
    },
  },
];

// Action tools - for executing actions that generate artifacts
export const actionTools: Anthropic.Tool[] = [
  {
    name: 'generate_calendar_file',
    description:
      "Generate a downloadable .ics calendar file with World Cup matches. Use this when the user wants to add matches to their calendar. Can generate for a specific team or specific matches. ALWAYS use this after showing a team's schedule.",
    input_schema: {
      type: 'object' as const,
      properties: {
        teamId: {
          type: 'string',
          description:
            "Optional team ID to generate calendar for all their matches (e.g., 'mex', 'arg')",
        },
        matchIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional array of specific match IDs to include in the calendar',
        },
        title: {
          type: 'string',
          description: "Optional custom title for the calendar (e.g., 'Mexico World Cup 2026')",
        },
      },
      required: [],
    },
  },
  {
    name: 'generate_shareable_image',
    description:
      "Generate a shareable image for social media. Use this when the user wants to share a team's schedule, a single match, or their prediction.",
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['schedule', 'prediction', 'single_match'],
          description: 'Type of image to generate',
        },
        teamId: {
          type: 'string',
          description: 'Team ID for schedule images',
        },
        matchId: {
          type: 'string',
          description: 'Match ID for single match images',
        },
        prediction: {
          type: 'object',
          properties: {
            champion: { type: 'string' },
            finalist: { type: 'string' },
          },
          description: 'Prediction data for prediction images',
        },
        title: {
          type: 'string',
          description: 'Custom title for the image',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'create_quiniela',
    description:
      "Create a new prediction pool (quiniela) for World Cup matches. Use this when the user mentions 'quiniela', 'pool', 'betting pool', or wants to create predictions with friends.",
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: "Name of the quiniela/pool (e.g., 'La Quiniela de Juan')",
        },
        ownerName: {
          type: 'string',
          description: 'Name of the pool creator (defaults to "Anonimo")',
        },
        isPrivate: {
          type: 'boolean',
          description: 'Whether the pool is private (invite-only) or public',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'generate_bracket_share',
    description:
      'Generate a shareable World Cup bracket/prediction image. Use this when the user makes a prediction about the champion or wants to share their bracket.',
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
  {
    name: 'set_match_reminder',
    description:
      "Set a reminder for a specific match. Use this when the user wants to be reminded before a match starts. Responds with a reminder confirmation that the frontend will handle.",
    input_schema: {
      type: 'object' as const,
      properties: {
        matchId: {
          type: 'string',
          description: 'The match ID to set a reminder for',
        },
        minutesBefore: {
          type: 'number',
          description: 'Minutes before match to remind (15, 30, or 60). Default is 30.',
        },
      },
      required: ['matchId'],
    },
  },
];

// Combined tools for Claude API
export const allWorldCupTools: Anthropic.Tool[] = [...queryTools, ...actionTools];

// Set of action tool names for quick lookup
export const ACTION_TOOL_NAMES = new Set([
  'generate_calendar_file',
  'generate_shareable_image',
  'create_quiniela',
  'generate_bracket_share',
  'set_match_reminder',
]);
