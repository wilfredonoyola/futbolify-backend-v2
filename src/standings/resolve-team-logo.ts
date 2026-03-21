/**
 * Normaliza logos de equipos: las rutas locales (/images/teams/…) no sirven para clientes móviles/web.
 * API-Football CDN: https://media.api-sports.io/football/teams/{id}.png
 */

const MEDIA_TEAM = 'https://media.api-sports.io/football/teams';

/** IDs API-Football — La Liga (140) */
const LA_LIGA_API_ID: Record<string, number> = {
  'real-madrid': 541,
  barcelona: 529,
  'atletico-madrid': 530,
  'athletic-bilbao': 531,
  valencia: 532,
  villarreal: 533,
  'real-betis': 543,
  sevilla: 536,
  girona: 547,
  'real-sociedad': 548,
  osasuna: 727,
  'celta-vigo': 538,
  getafe: 540,
  'rayo-vallecano': 728,
  mallorca: 798,
  alaves: 542,
  'las-palmas': 534,
  espanyol: 722,
  valladolid: 724,
  leganes: 537,
};

/** Premier — slugs alineados con standings JSON (manchester-city, nottingham-forest, …) */
const PREMIER_API_ID: Record<string, number> = {
  arsenal: 42,
  'aston-villa': 66,
  bournemouth: 35,
  brentford: 55,
  brighton: 51,
  chelsea: 49,
  'crystal-palace': 52,
  everton: 45,
  fulham: 36,
  ipswich: 57,
  leicester: 46,
  liverpool: 40,
  'manchester-city': 50,
  'man-city': 50,
  newcastle: 34,
  'manchester-united': 33,
  'man-united': 33,
  'nottingham-forest': 65,
  'nottm-forest': 65,
  southampton: 41,
  tottenham: 47,
  'west-ham': 48,
  wolves: 39,
};

const CHAMPIONS_EXTRA: Record<string, number> = {
  'bayern-munich': 157,
  'inter-milan': 505,
  'ac-milan': 489,
  milan: 489,
  psg: 85,
  'borussia-dortmund': 165,
  dortmund: 165,
  porto: 212,
  benfica: 211,
  juventus: 496,
  'rb-leipzig': 173,
  'sporting-cp': 228,
  'bayer-leverkusen': 168,
  ajax: 194,
  celtic: 247,
  psv: 197,
  feyenoord: 209,
  'club-brugge': 569,
  shakhtar: 550,
  'red-bull-salzburg': 571,
  'young-boys': 565,
  lille: 79,
  'dinamo-zagreb': 620,
  monaco: 91,
  bologna: 500,
  napoli: 492,
};

const CHAMPIONS_API_ID: Record<string, number> = {
  ...LA_LIGA_API_ID,
  ...PREMIER_API_ID,
  ...CHAMPIONS_EXTRA,
};

function cdnLogoForSlug(
  leagueId: string | undefined,
  teamSlug: string,
): string | undefined {
  if (!leagueId) return undefined;
  let id: number | undefined;
  switch (leagueId) {
    case 'la-liga':
      id = LA_LIGA_API_ID[teamSlug];
      break;
    case 'premier-league':
      id = PREMIER_API_ID[teamSlug];
      break;
    case 'champions-league':
      id = CHAMPIONS_API_ID[teamSlug];
      break;
    default:
      return undefined;
  }
  return id !== undefined ? `${MEDIA_TEAM}/${id}.png` : undefined;
}

/**
 * Devuelve URL absoluta para el logo del equipo en respuestas GraphQL.
 */
export function resolveTeamLogoUrl(
  leagueId: string,
  teamSlug: string,
  logo?: string | null,
): string | undefined {
  if (logo?.startsWith('https://') || logo?.startsWith('http://')) {
    return logo;
  }
  if (logo?.startsWith('//')) {
    return `https:${logo}`;
  }
  if (logo?.startsWith('/')) {
    return cdnLogoForSlug(leagueId, teamSlug);
  }
  if (logo) {
    return logo;
  }
  return cdnLogoForSlug(leagueId, teamSlug);
}
