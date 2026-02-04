import { Injectable, Logger } from '@nestjs/common';

/**
 * Match context for AI analysis
 */
export interface MatchContext {
  hasMatchToday: boolean;
  hasMatchTomorrow: boolean;
  isLive: boolean; // Match is currently being played
  liveMatch?: {
    fixtureId: number; // API-Football fixture ID for linking to live page
    opponent: string;
    date: Date;
    time: string;
    competition: string;
    isHome: boolean;
    score: string; // "0-0", "2-1"
    minute: number;
    status: string; // "1H", "2H", "HT", "ET"
  };
  nextMatch?: {
    opponent: string;
    date: Date;
    time: string;
    competition: string;
    isHome: boolean;
    hoursUntil: number;
  };
  lastMatch?: {
    opponent: string;
    date: Date;
    result: string; // "W 3-0", "L 1-2", "D 1-1"
    competition: string;
    wasHome: boolean;
    daysAgo: number;
  };
  isMatchday: boolean;
  matchdayPhase?: 'pre-match' | 'match-day' | 'post-match' | 'live';
}

/**
 * Team IDs mapping for API-Football (RapidAPI)
 * Covers ALL competitions: La Liga, Copa del Rey, Champions, Supercopa, etc.
 */
const TEAM_API_IDS: Record<string, { id: number; name: string }> = {
  // La Liga
  'real-madrid': { id: 541, name: 'Real Madrid' },
  'barcelona': { id: 529, name: 'Barcelona' },
  'atletico-madrid': { id: 530, name: 'Atletico Madrid' },
  'sevilla': { id: 536, name: 'Sevilla' },
  'real-betis': { id: 543, name: 'Real Betis' },
  'real-sociedad': { id: 548, name: 'Real Sociedad' },
  'athletic-bilbao': { id: 531, name: 'Athletic Club' },
  'villarreal': { id: 533, name: 'Villarreal' },
  'valencia': { id: 532, name: 'Valencia' },
  'getafe': { id: 546, name: 'Getafe' },
  'celta-vigo': { id: 538, name: 'Celta Vigo' },
  'osasuna': { id: 727, name: 'Osasuna' },
  'mallorca': { id: 798, name: 'Mallorca' },
  'girona': { id: 547, name: 'Girona' },
  'las-palmas': { id: 534, name: 'Las Palmas' },
  'alaves': { id: 542, name: 'Alaves' },
  'rayo-vallecano': { id: 728, name: 'Rayo Vallecano' },
  'espanyol': { id: 540, name: 'Espanyol' },
  'leganes': { id: 539, name: 'Leganes' },
  'valladolid': { id: 720, name: 'Real Valladolid' },
  // Premier League
  'manchester-city': { id: 50, name: 'Manchester City' },
  'manchester-united': { id: 33, name: 'Manchester United' },
  'liverpool': { id: 40, name: 'Liverpool' },
  'arsenal': { id: 42, name: 'Arsenal' },
  'chelsea': { id: 49, name: 'Chelsea' },
  'tottenham': { id: 47, name: 'Tottenham' },
  'newcastle': { id: 34, name: 'Newcastle' },
  'aston-villa': { id: 66, name: 'Aston Villa' },
  'brighton': { id: 51, name: 'Brighton' },
  'west-ham': { id: 48, name: 'West Ham' },
  'bournemouth': { id: 35, name: 'Bournemouth' },
  'crystal-palace': { id: 52, name: 'Crystal Palace' },
  'fulham': { id: 36, name: 'Fulham' },
  'wolves': { id: 39, name: 'Wolves' },
  'everton': { id: 45, name: 'Everton' },
  'brentford': { id: 55, name: 'Brentford' },
  'nottingham-forest': { id: 65, name: 'Nottingham Forest' },
  'leicester': { id: 46, name: 'Leicester' },
  'ipswich': { id: 57, name: 'Ipswich' },
  'southampton': { id: 41, name: 'Southampton' },
  // Serie A
  'juventus': { id: 496, name: 'Juventus' },
  'inter-milan': { id: 505, name: 'Inter' },
  'ac-milan': { id: 489, name: 'AC Milan' },
  'napoli': { id: 492, name: 'Napoli' },
  'roma': { id: 497, name: 'AS Roma' },
  'lazio': { id: 487, name: 'Lazio' },
  'atalanta': { id: 499, name: 'Atalanta' },
  'fiorentina': { id: 502, name: 'Fiorentina' },
  // Bundesliga
  'bayern-munich': { id: 157, name: 'Bayern Munich' },
  'borussia-dortmund': { id: 165, name: 'Borussia Dortmund' },
  'rb-leipzig': { id: 173, name: 'RB Leipzig' },
  'bayer-leverkusen': { id: 168, name: 'Bayer Leverkusen' },
  // Ligue 1
  'psg': { id: 85, name: 'Paris Saint Germain' },
  'marseille': { id: 81, name: 'Marseille' },
  'lyon': { id: 80, name: 'Lyon' },
  'monaco': { id: 91, name: 'Monaco' },
  // Argentina
  'boca-juniors': { id: 451, name: 'Boca Juniors' },
  'river-plate': { id: 435, name: 'River Plate' },
  // Brazil
  'flamengo': { id: 127, name: 'Flamengo' },
  'palmeiras': { id: 121, name: 'Palmeiras' },
  'corinthians': { id: 131, name: 'Corinthians' },
  'sao-paulo': { id: 126, name: 'Sao Paulo' },
  // Mexico
  'america': { id: 2283, name: 'Club America' },
  'chivas': { id: 2287, name: 'Guadalajara' },
  'cruz-azul': { id: 2282, name: 'Cruz Azul' },
  // Women's teams (use men's IDs as fallback for now)
  'barcelona-femeni': { id: 529, name: 'Barcelona' },
  'real-madrid-femenino': { id: 541, name: 'Real Madrid' },
};

@Injectable()
export class MatchContextService {
  private readonly logger = new Logger(MatchContextService.name);
  private readonly apiKey = process.env.API_FOOTBALL_KEY;
  private readonly baseUrl = 'https://v3.football.api-sports.io'; // Direct API-Sports endpoint

  // Cache for match data (30 minutes - balances freshness vs API quota)
  // Free plan: 100 requests/day. With 30min cache = max 48 req/day per team
  private readonly matchCache = new Map<string, { data: MatchContext; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000;

  /**
   * Get match context for a team
   */
  async getMatchContext(teamId: string): Promise<MatchContext> {
    // Check cache
    const cacheKey = teamId;
    const cached = this.matchCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(`Cache hit for team ${teamId}`);
      return cached.data;
    }

    // Check if we have API key and team mapping
    const teamInfo = TEAM_API_IDS[teamId];
    if (!this.apiKey || !teamInfo) {
      this.logger.debug(`No API key or team mapping for ${teamId}, using fallback`);
      return this.getFallbackContext(teamId);
    }

    try {
      const context = await this.fetchMatchContext(teamInfo);

      // Cache result
      this.matchCache.set(cacheKey, {
        data: context,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      this.logger.log(`🏟️ Match context for ${teamInfo.name}: ${context.isMatchday ? 'MATCHDAY' : 'Normal'}${context.nextMatch ? ` - Next: vs ${context.nextMatch.opponent}` : ''}`);

      return context;
    } catch (error) {
      this.logger.error(`Error fetching match context for ${teamId}: ${error.message}`);
      return this.getFallbackContext(teamId);
    }
  }

  /**
   * Fetch match context from API-Football (RapidAPI)
   */
  private async fetchMatchContext(
    teamInfo: { id: number; name: string }
  ): Promise<MatchContext> {
    const now = new Date();

    // Fetch next 3 fixtures and last 3 fixtures in parallel
    const [nextResponse, lastResponse] = await Promise.all([
      fetch(`${this.baseUrl}/fixtures?team=${teamInfo.id}&next=3`, {
        headers: {
          'x-apisports-key': this.apiKey!,
        },
      }),
      fetch(`${this.baseUrl}/fixtures?team=${teamInfo.id}&last=3`, {
        headers: {
          'x-apisports-key': this.apiKey!,
        },
      }),
    ]);

    if (!nextResponse.ok || !lastResponse.ok) {
      throw new Error(`API error: next=${nextResponse.status}, last=${lastResponse.status}`);
    }

    const nextData = await nextResponse.json();
    const lastData = await lastResponse.json();

    const futureMatches = nextData.response || [];
    const pastMatches = lastData.response || [];

    return this.parseMatchesIntoContext(futureMatches, pastMatches, teamInfo.id, now);
  }

  /**
   * Live match status codes from API-Football
   */
  private readonly LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
  private readonly FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];

  /**
   * Check if a match is currently live
   */
  private isMatchLive(match: any): boolean {
    const status = match.fixture?.status?.short;
    return this.LIVE_STATUSES.includes(status);
  }

  /**
   * Check if a match is finished
   */
  private isMatchFinished(match: any): boolean {
    const status = match.fixture?.status?.short;
    return this.FINISHED_STATUSES.includes(status);
  }

  /**
   * Parse API-Football matches into MatchContext
   */
  private parseMatchesIntoContext(
    futureMatches: any[],
    pastMatches: any[],
    teamId: number,
    now: Date
  ): MatchContext {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const dayAfterTomorrow = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Check for LIVE match in pastMatches (API puts live matches there)
    const liveMatchData = pastMatches.find(m => this.isMatchLive(m));
    const liveMatch = liveMatchData ? this.parseLiveMatch(liveMatchData, teamId) : undefined;
    const isLive = !!liveMatch;

    // Filter out live matches from pastMatches to get actual finished matches
    const finishedMatches = pastMatches.filter(m => this.isMatchFinished(m));

    // Next match (from future matches)
    const nextMatchData = futureMatches[0];
    const nextMatch = nextMatchData ? this.parseNextMatch(nextMatchData, teamId, now) : undefined;

    // Last finished match
    const lastMatchData = finishedMatches[0];
    const lastMatch = lastMatchData ? this.parseLastMatch(lastMatchData, teamId, now) : undefined;

    // Check if match today/tomorrow from future matches
    let hasMatchToday = futureMatches.some(m => {
      const matchDate = new Date(m.fixture.date);
      return matchDate >= today && matchDate < tomorrow;
    });

    // If there's a live match, it counts as "match today"
    if (isLive) {
      hasMatchToday = true;
    }

    const hasMatchTomorrow = futureMatches.some(m => {
      const matchDate = new Date(m.fixture.date);
      return matchDate >= tomorrow && matchDate < dayAfterTomorrow;
    });

    // Determine matchday phase
    let isMatchday = false;
    let matchdayPhase: 'pre-match' | 'match-day' | 'post-match' | 'live' | undefined;

    if (isLive) {
      isMatchday = true;
      matchdayPhase = 'live';
    } else if (hasMatchToday) {
      isMatchday = true;
      matchdayPhase = 'match-day';
    } else if (hasMatchTomorrow) {
      isMatchday = true;
      matchdayPhase = 'pre-match';
    } else if (lastMatch && lastMatch.daysAgo <= 1) {
      isMatchday = true;
      matchdayPhase = 'post-match';
    }

    return {
      hasMatchToday,
      hasMatchTomorrow,
      isLive,
      liveMatch,
      nextMatch,
      lastMatch,
      isMatchday,
      matchdayPhase,
    };
  }

  /**
   * Parse live match data from API-Football format
   */
  private parseLiveMatch(match: any, teamId: number): MatchContext['liveMatch'] {
    const isHome = match.teams.home.id === teamId;
    const opponent = isHome ? match.teams.away.name : match.teams.home.name;
    const matchDate = new Date(match.fixture.date);
    const homeScore = match.goals?.home ?? 0;
    const awayScore = match.goals?.away ?? 0;

    return {
      fixtureId: match.fixture.id,
      opponent,
      date: matchDate,
      time: matchDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      competition: match.league?.name || 'Liga',
      isHome,
      score: isHome ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`,
      minute: match.fixture?.status?.elapsed || 0,
      status: match.fixture?.status?.short || 'LIVE',
    };
  }

  /**
   * Parse next match data from API-Football format
   */
  private parseNextMatch(match: any, teamId: number, now: Date): MatchContext['nextMatch'] {
    const isHome = match.teams.home.id === teamId;
    const opponent = isHome ? match.teams.away.name : match.teams.home.name;
    const matchDate = new Date(match.fixture.date);
    const hoursUntil = Math.floor((matchDate.getTime() - now.getTime()) / (1000 * 60 * 60));

    return {
      opponent,
      date: matchDate,
      time: matchDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      competition: match.league?.name || 'Liga',
      isHome,
      hoursUntil,
    };
  }

  /**
   * Parse last match data from API-Football format
   */
  private parseLastMatch(match: any, teamId: number, now: Date): MatchContext['lastMatch'] {
    const wasHome = match.teams.home.id === teamId;
    const opponent = wasHome ? match.teams.away.name : match.teams.home.name;
    const matchDate = new Date(match.fixture.date);
    const daysAgo = Math.floor((now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24));

    const homeScore = match.goals?.home ?? 0;
    const awayScore = match.goals?.away ?? 0;
    const teamScore = wasHome ? homeScore : awayScore;
    const opponentScore = wasHome ? awayScore : homeScore;

    let resultPrefix = 'D';
    if (teamScore > opponentScore) resultPrefix = 'W';
    else if (teamScore < opponentScore) resultPrefix = 'L';

    return {
      opponent,
      date: matchDate,
      result: `${resultPrefix} ${teamScore}-${opponentScore}`,
      competition: match.league?.name || 'Liga',
      wasHome,
      daysAgo,
    };
  }

  /**
   * Fallback context when API is not available
   * Uses day of week heuristics (most matches are on weekends)
   */
  private getFallbackContext(teamId: string): MatchContext {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Heuristic: weekend = likely matchday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFriday = dayOfWeek === 5;
    const isMonday = dayOfWeek === 1;

    return {
      hasMatchToday: isWeekend,
      hasMatchTomorrow: isFriday,
      isLive: false,
      isMatchday: isWeekend || isFriday || isMonday,
      matchdayPhase: isWeekend ? 'match-day' : isFriday ? 'pre-match' : isMonday ? 'post-match' : undefined,
    };
  }

  /**
   * Build context string for AI prompt
   */
  buildContextPrompt(context: MatchContext, teamName: string): string {
    const lines: string[] = [];

    // LIVE MATCH has highest priority
    if (context.isLive && context.liveMatch) {
      const statusText = context.liveMatch.status === 'HT' ? 'DESCANSO' : `Min ${context.liveMatch.minute}'`;
      lines.push(`🔴 ¡EN VIVO! ${teamName} vs ${context.liveMatch.opponent} (${context.liveMatch.score}) - ${statusText}`);
      lines.push(`Competición: ${context.liveMatch.competition}`);
      lines.push(`Prioriza contenido EN VIVO: reacciones al marcador, jugadas destacadas, comentarios del partido.`);
    } else if (context.hasMatchToday && context.nextMatch) {
      lines.push(`🔴 ¡PARTIDO HOY! ${teamName} vs ${context.nextMatch.opponent} a las ${context.nextMatch.time} (${context.nextMatch.competition})`);
      lines.push(`Prioriza contenido de MATCHDAY: alineaciones, predicciones, ambiente previo.`);
    } else if (context.hasMatchTomorrow && context.nextMatch) {
      lines.push(`📅 PARTIDO MAÑANA: ${teamName} vs ${context.nextMatch.opponent} (${context.nextMatch.competition})`);
      lines.push(`Prioriza contenido de PREVIA: análisis del rival, predicciones, convocatoria.`);
    } else if (context.nextMatch) {
      const daysText = context.nextMatch.hoursUntil < 48
        ? `en ${context.nextMatch.hoursUntil} horas`
        : `en ${Math.floor(context.nextMatch.hoursUntil / 24)} días`;
      lines.push(`Próximo partido: ${teamName} vs ${context.nextMatch.opponent} ${daysText}`);
    }

    if (context.lastMatch) {
      const resultEmoji = context.lastMatch.result.startsWith('W') ? '✅' :
                          context.lastMatch.result.startsWith('L') ? '❌' : '🟡';
      if (context.lastMatch.daysAgo <= 2) {
        lines.push(`${resultEmoji} Último partido (hace ${context.lastMatch.daysAgo} día${context.lastMatch.daysAgo > 1 ? 's' : ''}): ${context.lastMatch.result} vs ${context.lastMatch.opponent}`);
        if (context.lastMatch.daysAgo <= 1 && !context.isLive) {
          lines.push(`Prioriza contenido POST-PARTIDO: reacciones, análisis, destacados.`);
        }
      }
    }

    if (context.isMatchday) {
      const modeText = context.isLive ? 'EN VIVO' : 'MATCHDAY';
      lines.push(`⚡ MODO ${modeText} ACTIVO - El contenido relacionado al partido tiene prioridad ALTA.`);
    }

    return lines.length > 0 ? lines.join('\n') : '';
  }

  /**
   * Clean up expired cache
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.matchCache.entries()) {
      if (now > entry.expiresAt) {
        this.matchCache.delete(key);
      }
    }
  }
}
