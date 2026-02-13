export interface League {
  id: string
  name: string
  flag: string
  search: string
}

export const LEAGUES: League[] = [
  {
    id: 'premier-league',
    name: 'Premier League',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    search: 'Premier League England fixtures today',
  },
  {
    id: 'la-liga',
    name: 'La Liga',
    flag: '🇪🇸',
    search: 'La Liga Spain fixtures today',
  },
  {
    id: 'serie-a',
    name: 'Serie A',
    flag: '🇮🇹',
    search: 'Serie A Italy fixtures today',
  },
  {
    id: 'bundesliga',
    name: 'Bundesliga',
    flag: '🇩🇪',
    search: 'Bundesliga Germany fixtures today',
  },
  {
    id: 'ligue-1',
    name: 'Ligue 1',
    flag: '🇫🇷',
    search: 'Ligue 1 France fixtures today',
  },
  {
    id: 'liga-mx',
    name: 'Liga MX',
    flag: '🇲🇽',
    search: 'Liga MX Mexico fixtures today',
  },
  {
    id: 'champions',
    name: 'Champions League',
    flag: '🏆',
    search: 'UEFA Champions League fixtures this week',
  },
  {
    id: 'libertadores',
    name: 'Libertadores',
    flag: '🏆',
    search: 'Copa Libertadores fixtures this week',
  },
]
