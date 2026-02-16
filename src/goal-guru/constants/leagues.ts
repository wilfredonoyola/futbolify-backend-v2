export interface League {
  id: string
  name: string
  flag: string
  search: string
  /** Average G1H rate based on research - higher = better for G1H betting */
  g1hRating?: 'HIGH' | 'MEDIUM' | 'LOW'
  /** Average first half goals per match */
  avgG1H?: number
}

/**
 * Leagues sorted by G1H value potential
 * Research source: FootyStats, Over25Tips, Performance Odds
 *
 * TOP G1H LEAGUES (avg >1.40 goals in 1H):
 * - Eredivisie (1.40), Danish Superliga (1.55), Bundesliga, Norwegian Eliteserien
 *
 * MEDIUM G1H LEAGUES:
 * - Premier League (76% G1H rate), Serie A, Liga MX
 *
 * LOWER G1H LEAGUES:
 * - La Liga (tactical, slower starts), Ligue 1
 */
export const LEAGUES: League[] = [
  // === HIGH G1H POTENTIAL (Expert recommended) ===
  {
    id: 'eredivisie',
    name: 'Eredivisie',
    flag: '🇳🇱',
    search: 'Eredivisie Netherlands fixtures today',
    g1hRating: 'HIGH',
    avgG1H: 1.40,
  },
  {
    id: 'bundesliga',
    name: 'Bundesliga',
    flag: '🇩🇪',
    search: 'Bundesliga Germany fixtures today',
    g1hRating: 'HIGH',
    avgG1H: 1.35,
  },
  {
    id: 'danish-superliga',
    name: 'Danish Superliga',
    flag: '🇩🇰',
    search: 'Danish Superliga fixtures today',
    g1hRating: 'HIGH',
    avgG1H: 1.55,
  },
  {
    id: 'norwegian-eliteserien',
    name: 'Eliteserien',
    flag: '🇳🇴',
    search: 'Norwegian Eliteserien fixtures today',
    g1hRating: 'HIGH',
    avgG1H: 1.38,
  },

  // === MEDIUM G1H POTENTIAL ===
  {
    id: 'premier-league',
    name: 'Premier League',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    search: 'Premier League England fixtures today',
    g1hRating: 'MEDIUM',
    avgG1H: 1.25,
  },
  {
    id: 'serie-a',
    name: 'Serie A',
    flag: '🇮🇹',
    search: 'Serie A Italy fixtures today',
    g1hRating: 'MEDIUM',
    avgG1H: 1.22,
  },
  {
    id: 'liga-mx',
    name: 'Liga MX',
    flag: '🇲🇽',
    search: 'Liga MX Mexico fixtures today',
    g1hRating: 'MEDIUM',
    avgG1H: 1.20,
  },
  {
    id: 'champions',
    name: 'Champions League',
    flag: '🏆',
    search: 'UEFA Champions League fixtures this week',
    g1hRating: 'MEDIUM',
    avgG1H: 1.30,
  },

  // === LOWER G1H POTENTIAL (more tactical/defensive) ===
  {
    id: 'la-liga',
    name: 'La Liga',
    flag: '🇪🇸',
    search: 'La Liga Spain fixtures today',
    g1hRating: 'LOW',
    avgG1H: 1.15,
  },
  {
    id: 'ligue-1',
    name: 'Ligue 1',
    flag: '🇫🇷',
    search: 'Ligue 1 France fixtures today',
    g1hRating: 'LOW',
    avgG1H: 1.18,
  },
  {
    id: 'libertadores',
    name: 'Libertadores',
    flag: '🏆',
    search: 'Copa Libertadores fixtures this week',
    g1hRating: 'LOW',
    avgG1H: 1.10,
  },
]
