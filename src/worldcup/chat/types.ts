// Types for World Cup 2026 Chat Service

export type Locale = 'es' | 'en';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserContext {
  favoriteTeams?: string[];
  timezone: string;
}

export interface ChatDataPayload {
  type: 'matches' | 'teams' | 'groups' | 'venues' | 'schedule';
  items: ChatDataItem[];
}

export interface ChatDataItem {
  type: 'match' | 'team' | 'group' | 'venue';
  data: MatchData | TeamData | GroupData | VenueData;
}

export interface MatchData {
  id: string;
  homeTeam: {
    id: string;
    name: string;
    code: string;
    flag: string;
  };
  awayTeam: {
    id: string;
    name: string;
    code: string;
    flag: string;
  };
  dateTimeUTC: string;
  venue: {
    id: string;
    name: string;
    city: string;
    country: string;
  };
  stage: string;
  stageName: string;
  groupId?: string;
  broadcasts: {
    spanish: string[];
    english: string[];
  };
}

export interface TeamData {
  id: string;
  name: string;
  code: string;
  flag: string;
  groupId: string;
  groupName: string;
  confederation: string;
  worldCupAppearances?: number;
  bestResult?: string;
  isHost: boolean;
  qualified: boolean;
}

export interface GroupData {
  id: string;
  name: string;
  teams: Array<{
    id: string;
    name: string;
    code: string;
    flag: string;
  }>;
  matchCount: number;
}

export interface VenueData {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  capacity: number;
  timezone: string;
  matchCount: number;
}

// Action types
export type ActionType =
  | 'generate_calendar'
  | 'generate_share_image'
  | 'create_quiniela'
  | 'set_reminder';

export interface ActionResult {
  success: boolean;
  actionType: ActionType;
  artifact?: ActionArtifact;
  error?: string;
}

export interface ActionArtifact {
  type: 'file' | 'image' | 'embed';
  filename?: string;
  mimeType?: string;
  data?: string; // base64
  embedType?:
    | 'calendar_ready'
    | 'share_image'
    | 'quiniela_invite'
    | 'reminder_set'
    | 'bracket_share';
  embedData?: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Tool params
export interface GetTeamMatchesParams {
  teamId: string;
}

export interface GetMatchInfoParams {
  matchId: string;
}

export interface GetUpcomingMatchesParams {
  limit?: number;
}

export interface GetGroupInfoParams {
  groupId: string;
}

export interface GetVenueInfoParams {
  venueId: string;
}

export interface GetMatchesOnDateParams {
  date: string;
}

export interface ConvertMatchTimeParams {
  matchId: string;
  timezone: string;
}

export interface SearchTeamsParams {
  query: string;
}

// Action params
export interface GenerateCalendarParams {
  teamId?: string;
  matchIds?: string[];
  title?: string;
}

export interface GenerateShareImageParams {
  type: 'schedule' | 'prediction' | 'single_match';
  teamId?: string;
  matchId?: string;
  prediction?: {
    champion?: string;
    finalist?: string;
  };
  title?: string;
}

export interface CreateQuinielaParams {
  name: string;
  ownerName?: string;
  isPrivate?: boolean;
}

export interface GenerateBracketShareParams {
  championId: string;
  runnerUpId?: string;
  userName?: string;
}

export interface SetReminderParams {
  matchId: string;
  minutesBefore?: number;
}
