// Types for Universal Football Chat

export type Locale = 'es' | 'en';

export interface LeagueConfig {
  id: string;
  apiId: number;
  name: { es: string; en: string };
  shortName: string;
  color: string;
  icon: string;
}

export interface MatchData {
  id: string;
  homeTeam: TeamData;
  awayTeam: TeamData;
  date: string;
  time: string;
  venue?: string;
  league: {
    id: string;
    name: string;
    logo?: string;
  };
  status: 'scheduled' | 'live' | 'finished' | 'postponed';
  score?: {
    home: number;
    away: number;
  };
  minute?: number;
  broadcasts?: BroadcastData[];
}

export interface TeamData {
  id: string;
  name: string;
  code: string;
  logo?: string;
  country?: string;
}

export interface StandingEntry {
  position: number;
  team: TeamData;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form?: string[];
}

export interface BroadcastData {
  channel: string;
  country: string;
  logo?: string;
}

// ChatDataPayload matches worldcup format for compatibility
export interface ChatDataPayload {
  type: 'matches' | 'standings' | 'teams' | 'live_scores' | 'venues';
  items: Array<{
    type: 'match' | 'standing' | 'team' | 'venue';
    data: unknown;
  }>;
}

export interface ActionResult {
  actionType: string;
  success: boolean;
  artifact?: {
    type: string;
    data: unknown;
  };
  error?: string;
}

// League IDs for API-Football
// Mundial 2026 uses static data (apiId: 0 indicates static data source)
export const FOOTBALL_LEAGUE_IDS: Record<string, LeagueConfig> = {
  'mundial-2026': {
    id: 'mundial-2026',
    apiId: 0, // Static data - not from API-Football
    name: { es: 'Copa del Mundo 2026', en: 'World Cup 2026' },
    shortName: 'Mundial',
    color: '#00A859',
    icon: 'Trophy',
  },
  'la-liga': {
    id: 'la-liga',
    apiId: 140,
    name: { es: 'La Liga', en: 'La Liga' },
    shortName: 'La Liga',
    color: '#EE324E',
    icon: 'Crown',
  },
  'premier-league': {
    id: 'premier-league',
    apiId: 39,
    name: { es: 'Premier League', en: 'Premier League' },
    shortName: 'Premier',
    color: '#3D195B',
    icon: 'Star',
  },
  'champions-league': {
    id: 'champions-league',
    apiId: 2,
    name: { es: 'Champions League', en: 'Champions League' },
    shortName: 'Champions',
    color: '#0A1B3E',
    icon: 'Trophy',
  },
  'liga-mx': {
    id: 'liga-mx',
    apiId: 262,
    name: { es: 'Liga MX', en: 'Liga MX' },
    shortName: 'Liga MX',
    color: '#006847',
    icon: 'Shield',
  },
  'bundesliga': {
    id: 'bundesliga',
    apiId: 78,
    name: { es: 'Bundesliga', en: 'Bundesliga' },
    shortName: 'Bundesliga',
    color: '#D20515',
    icon: 'Flame',
  },
  'serie-a': {
    id: 'serie-a',
    apiId: 135,
    name: { es: 'Serie A', en: 'Serie A' },
    shortName: 'Serie A',
    color: '#024494',
    icon: 'Zap',
  },
  'mls': {
    id: 'mls',
    apiId: 253,
    name: { es: 'MLS', en: 'MLS' },
    shortName: 'MLS',
    color: '#1A1A1A',
    icon: 'Star',
  },
};

// Helper to check if a league uses static data
export function isStaticLeague(leagueId: string): boolean {
  return leagueId === 'mundial-2026';
}

// Team name mappings for search
export const TEAM_ALIASES: Record<string, string[]> = {
  'real-madrid': ['real madrid', 'madrid', 'real', 'merengues'],
  'barcelona': ['barcelona', 'barca', 'fcb', 'blaugrana'],
  'atletico-madrid': ['atletico', 'atletico madrid', 'atleti'],
  'manchester-united': ['manchester united', 'man united', 'united', 'man utd'],
  'manchester-city': ['manchester city', 'man city', 'city'],
  'liverpool': ['liverpool', 'reds'],
  'chelsea': ['chelsea', 'blues'],
  'arsenal': ['arsenal', 'gunners'],
  'bayern-munich': ['bayern', 'bayern munich', 'fcb'],
  'america': ['america', 'aguilas', 'club america'],
  'chivas': ['chivas', 'guadalajara', 'rebano'],
  'pumas': ['pumas', 'unam'],
  'cruz-azul': ['cruz azul', 'maquina', 'cementeros'],
  'inter-miami': ['inter miami', 'miami'],
  'la-galaxy': ['la galaxy', 'galaxy', 'los angeles galaxy'],
};
