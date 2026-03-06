// World Cup 2026 Constants

export const WORLD_CUP_2026 = {
  name: {
    es: 'Copa Mundial FIFA 2026',
    en: 'FIFA World Cup 2026',
  },
  shortName: {
    es: 'Mundial 2026',
    en: 'World Cup 2026',
  },
  startDate: '2026-06-11T00:00:00Z',
  endDate: '2026-07-19T23:59:59Z',
  hostCountries: ['USA', 'Mexico', 'Canada'],
  totalTeams: 48,
  totalMatches: 104,
  totalGroups: 12,
  totalVenues: 16,
} as const;

export const STAGES: Record<string, { es: string; en: string }> = {
  group: {
    es: 'Fase de Grupos',
    en: 'Group Stage',
  },
  round32: {
    es: 'Ronda de 32',
    en: 'Round of 32',
  },
  round16: {
    es: 'Octavos de Final',
    en: 'Round of 16',
  },
  quarterfinal: {
    es: 'Cuartos de Final',
    en: 'Quarter-finals',
  },
  semifinal: {
    es: 'Semifinales',
    en: 'Semi-finals',
  },
  third: {
    es: 'Tercer Puesto',
    en: 'Third Place',
  },
  final: {
    es: 'Final',
    en: 'Final',
  },
};

export const CONFEDERATIONS: Record<string, { es: string; en: string }> = {
  UEFA: {
    es: 'UEFA (Europa)',
    en: 'UEFA (Europe)',
  },
  CONMEBOL: {
    es: 'CONMEBOL (Sudamerica)',
    en: 'CONMEBOL (South America)',
  },
  CONCACAF: {
    es: 'CONCACAF (Norte y Centroamerica)',
    en: 'CONCACAF (North & Central America)',
  },
  CAF: {
    es: 'CAF (Africa)',
    en: 'CAF (Africa)',
  },
  AFC: {
    es: 'AFC (Asia)',
    en: 'AFC (Asia)',
  },
  OFC: {
    es: 'OFC (Oceania)',
    en: 'OFC (Oceania)',
  },
};

// Message limits
export const ANONYMOUS_MESSAGE_LIMIT = 10; // Per 24 hours
export const AUTHENTICATED_MESSAGE_LIMIT = 50; // Per 24 hours
export const MESSAGE_LIMIT_RESET_HOURS = 24;

// Warning thresholds (show warning when X messages remaining)
export const ANONYMOUS_WARNING_THRESHOLDS = [3, 1, 0]; // At 7, 9, 10 messages
export const AUTHENTICATED_WARNING_THRESHOLDS = [10, 5, 0]; // At 40, 45, 50 messages
