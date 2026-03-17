// Action handlers for Football Chat
// Handles actions that produce artifacts (calendar files, images, quinielas, etc.)
// Supports Mundial 2026 (via QueriesService) and other leagues (via ApiFootball)

import { ApiFootballAdapter } from './adapters/api-football.adapter';
import { QueriesService } from '../../worldcup/queries/queries.service';
import { QuinielaService } from '../../quiniela/quiniela.service';
import { PredictionMode } from '../../quiniela/schemas/quiniela.schema';
import { Locale, ActionResult, MatchData, isStaticLeague, FOOTBALL_LEAGUE_IDS } from './types';

export async function executeAction(
  actionName: string,
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  quinielaService: QuinielaService,
  locale: Locale,
  anonymousCreatorId?: string,
): Promise<ActionResult | null> {
  switch (actionName) {
    case 'add_to_calendar':
      return handleAddToCalendar(input, adapter, queriesService, locale);

    case 'set_reminder':
      return handleSetReminder(input, adapter, queriesService, locale);

    case 'generate_share_image':
      return handleGenerateShareImage(input, adapter, queriesService, locale);

    case 'create_quiniela':
      return handleCreateQuiniela(input, quinielaService, locale, anonymousCreatorId);

    case 'save_prediction':
      return handleSavePrediction(input, queriesService, locale);

    case 'generate_bracket_share':
      return handleGenerateBracketShare(input, queriesService, locale);

    default:
      return null;
  }
}

async function handleAddToCalendar(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ActionResult> {
  const matchId = input.matchId as string | undefined;
  const teamName = input.teamName as string | undefined;
  const leagueId = input.leagueId as string | undefined;
  const title = input.title as string | undefined;

  let matches: MatchData[] = [];
  let calendarTitle = title || 'Football Matches';

  // Check if Mundial 2026
  if (leagueId === 'mundial-2026' || (!leagueId && teamName)) {
    // Try to find team in World Cup data
    const wcTeams = queriesService.searchTeams(teamName || '');
    if (wcTeams.length > 0) {
      const team = wcTeams[0];
      const wcMatches = queriesService.getMatchesByTeam(team.id);
      calendarTitle = title || `${team.name[locale]} - Mundial 2026`;

      // Convert to MatchData format
      matches = wcMatches.map((m) => {
        const homeTeam = queriesService.getTeamById(m.homeTeamId);
        const awayTeam = queriesService.getTeamById(m.awayTeamId);
        const venue = queriesService.getVenueById(m.venueId);
        return {
          id: m.id,
          homeTeam: {
            id: homeTeam?.id || '',
            name: homeTeam?.name[locale] || '',
            code: homeTeam?.code || '',
          },
          awayTeam: {
            id: awayTeam?.id || '',
            name: awayTeam?.name[locale] || '',
            code: awayTeam?.code || '',
          },
          date: m.dateTimeUTC.split('T')[0],
          time: m.dateTimeUTC.split('T')[1]?.slice(0, 5) || '00:00',
          venue: venue?.name,
          league: { id: 'mundial-2026', name: 'Mundial 2026' },
          status: 'scheduled' as const,
        };
      });
    }
  }

  // If no World Cup matches, try API-Football
  if (matches.length === 0 && teamName) {
    matches = await adapter.getTeamMatches(teamName, leagueId);
    matches = matches
      .filter((m) => new Date(m.date) >= new Date())
      .slice(0, 5);
    calendarTitle = title || `${teamName} Matches`;
  }

  if (matches.length === 0) {
    return {
      actionType: 'calendar',
      success: false,
      error: locale === 'es'
        ? 'No se encontraron partidos para agregar'
        : 'No matches found to add',
    };
  }

  // Generate ICS content
  const icsContent = generateICS(matches, calendarTitle, locale);

  return {
    actionType: 'calendar',
    success: true,
    artifact: {
      type: 'file',
      data: {
        filename: `futbolify-${calendarTitle.toLowerCase().replace(/\s+/g, '-')}.ics`,
        content: Buffer.from(icsContent).toString('base64'),
        mimeType: 'text/calendar',
        matchCount: matches.length,
        embedType: 'calendar_ready',
        embedData: {
          title: calendarTitle,
          matchCount: matches.length,
          matches: matches.slice(0, 3).map((m) => ({
            title: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
            date: m.date,
          })),
        },
      },
    },
  };
}

async function handleSetReminder(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ActionResult> {
  const matchId = input.matchId as string;
  const minutesBefore = (input.minutesBefore as number) || 30;

  if (!matchId) {
    return {
      actionType: 'set_reminder',
      success: false,
      error: 'matchId is required',
    };
  }

  // Try to find match in World Cup data
  const wcMatch = queriesService.getMatchById(matchId);
  let matchTitle = '';
  let matchDate = '';
  let homeFlag = '';
  let awayFlag = '';

  if (wcMatch) {
    const homeTeam = queriesService.getTeamById(wcMatch.homeTeamId);
    const awayTeam = queriesService.getTeamById(wcMatch.awayTeamId);
    matchTitle = `${homeTeam?.name[locale]} vs ${awayTeam?.name[locale]}`;
    matchDate = wcMatch.dateTimeUTC;
    homeFlag = homeTeam?.flag || '';
    awayFlag = awayTeam?.flag || '';
  }

  const reminderLabels: Record<number, Record<Locale, string>> = {
    15: { es: '15 minutos antes', en: '15 minutes before' },
    30: { es: '30 minutos antes', en: '30 minutes before' },
    60: { es: '1 hora antes', en: '1 hour before' },
  };

  return {
    actionType: 'set_reminder',
    success: true,
    artifact: {
      type: 'embed',
      data: {
        embedType: 'reminder_set',
        embedData: {
          matchId,
          matchTitle,
          matchDate,
          homeFlag,
          awayFlag,
          reminderTime: reminderLabels[minutesBefore]?.[locale] || `${minutesBefore} min`,
          minutesBefore,
          message: locale === 'es'
            ? `Te recordaremos ${minutesBefore} minutos antes del partido`
            : `We'll remind you ${minutesBefore} minutes before the match`,
        },
      },
    },
  };
}

async function handleGenerateShareImage(
  input: Record<string, unknown>,
  adapter: ApiFootballAdapter,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ActionResult> {
  const type = input.type as string;
  const matchId = input.matchId as string | undefined;
  const leagueId = input.leagueId as string | undefined;
  const teamName = input.teamName as string | undefined;

  let imageData: Record<string, unknown> = { type: 'unknown' };

  switch (type) {
    case 'match':
      // Try World Cup first
      if (matchId) {
        const wcMatch = queriesService.getMatchById(matchId);
        if (wcMatch) {
          const homeTeam = queriesService.getTeamById(wcMatch.homeTeamId);
          const awayTeam = queriesService.getTeamById(wcMatch.awayTeamId);
          const venue = queriesService.getVenueById(wcMatch.venueId);
          imageData = {
            type: 'match_card',
            isWorldCup: true,
            homeTeam: { name: homeTeam?.name[locale], flag: homeTeam?.flag, code: homeTeam?.code },
            awayTeam: { name: awayTeam?.name[locale], flag: awayTeam?.flag, code: awayTeam?.code },
            date: wcMatch.dateTimeUTC,
            venue: venue?.name,
            city: venue?.city[locale],
          };
        }
      }
      break;

    case 'standings':
      if (leagueId) {
        if (isStaticLeague(leagueId)) {
          // World Cup groups
          const groups = queriesService.getAllGroups();
          imageData = {
            type: 'groups_card',
            isWorldCup: true,
            groups: groups.slice(0, 4).map((g) => ({
              name: `Grupo ${g.id.toUpperCase()}`,
              teams: g.teamIds.map((tid) => {
                const t = queriesService.getTeamById(tid);
                return { name: t?.name[locale], flag: t?.flag };
              }),
            })),
          };
        } else {
          const standings = await adapter.getStandings(leagueId);
          const leagueConfig = FOOTBALL_LEAGUE_IDS[leagueId];
          imageData = {
            type: 'standings_card',
            league: leagueConfig?.name[locale],
            standings: standings.slice(0, 5),
          };
        }
      }
      break;

    case 'team_schedule':
      if (teamName) {
        // Try World Cup first
        const wcTeams = queriesService.searchTeams(teamName);
        if (wcTeams.length > 0) {
          const team = wcTeams[0];
          const wcMatches = queriesService.getMatchesByTeam(team.id);
          imageData = {
            type: 'schedule_card',
            isWorldCup: true,
            team: { name: team.name[locale], flag: team.flag, code: team.code },
            matches: wcMatches.slice(0, 5).map((m) => {
              const homeTeam = queriesService.getTeamById(m.homeTeamId);
              const awayTeam = queriesService.getTeamById(m.awayTeamId);
              return {
                homeTeam: { name: homeTeam?.name[locale], flag: homeTeam?.flag },
                awayTeam: { name: awayTeam?.name[locale], flag: awayTeam?.flag },
                date: m.dateTimeUTC,
              };
            }),
          };
        } else {
          // Use API-Football
          const matches = await adapter.getTeamMatches(teamName);
          imageData = {
            type: 'schedule_card',
            teamName,
            matches: matches.filter((m) => new Date(m.date) >= new Date()).slice(0, 5),
          };
        }
      }
      break;
  }

  return {
    actionType: 'generate_share_image',
    success: true,
    artifact: {
      type: 'embed',
      data: {
        embedType: 'share_image',
        embedData: {
          ...imageData,
          shareUrl: 'https://futbolify.com/share/',
          locale,
        },
      },
    },
  };
}

// ============================================
// QUINIELA CREATION
// ============================================

async function handleCreateQuiniela(
  input: Record<string, unknown>,
  quinielaService: QuinielaService,
  locale: Locale,
  providedAnonymousId?: string,
): Promise<ActionResult> {
  const name = input.name as string;
  const ownerName = (input.ownerName as string) || 'Organizador';
  const isPrivate = (input.isPrivate as boolean) ?? true;
  const leagueId = input.leagueId as string | undefined;

  if (!name) {
    return {
      actionType: 'create_quiniela',
      success: false,
      error: locale === 'es' ? 'Se requiere un nombre para la quiniela' : 'Quiniela name is required',
    };
  }

  try {
    // Use provided anonymousCreatorId from frontend, or generate fallback
    const anonymousCreatorId = providedAnonymousId || `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const result = await quinielaService.createQuiniela(
      {
        name,
        isPrivate,
        anonymousCreatorId,
        ownerName,
        predictionMode: PredictionMode.SIMPLE,
      },
      undefined, // No userId (anonymous)
      ownerName,
    );

    return {
      actionType: 'create_quiniela',
      success: true,
      artifact: {
        type: 'embed',
        data: {
          embedType: 'quiniela_invite',
          embedData: {
            quinielaId: result.quinielaId,
            poolName: result.quinielaName,
            ownerName: result.ownerName,
            code: result.code,
            inviteLink: result.inviteUrl,
            memberCount: result.memberCount,
            isPrivate: result.isPrivate,
            isAnonymous: result.isAnonymous,
            anonymousCreatorId: result.anonymousCreatorId,
            leagueId,
            createdAt: new Date().toISOString(),
            rules: {
              exactScore: 5,
              correctResult: 2,
              bonusChampion: 10,
            },
          },
        },
      },
    };
  } catch (error) {
    return {
      actionType: 'create_quiniela',
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create quiniela',
    };
  }
}

// ============================================
// SAVE PREDICTION
// ============================================

function handleSavePrediction(
  input: Record<string, unknown>,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ActionResult> {
  const matchId = input.matchId as string | undefined;
  const homeTeamName = input.homeTeamName as string | undefined;
  const awayTeamName = input.awayTeamName as string | undefined;
  const simplePrediction = input.simplePrediction as 'home' | 'draw' | 'away';
  const homeScore = input.homeScore as number | undefined;
  const awayScore = input.awayScore as number | undefined;

  // Find match by ID or by team names
  let match = matchId ? queriesService.getMatchById(matchId) : null;

  if (!match && homeTeamName && awayTeamName) {
    const allMatches = queriesService.getAllMatches();
    match = allMatches.find((m) => {
      const home = queriesService.getTeamById(m.homeTeamId);
      const away = queriesService.getTeamById(m.awayTeamId);
      const homeName = home?.name.es?.toLowerCase() || '';
      const awayName = away?.name.es?.toLowerCase() || '';
      return (
        homeName.includes(homeTeamName.toLowerCase()) &&
        awayName.includes(awayTeamName.toLowerCase())
      );
    });
  }

  if (!match) {
    return Promise.resolve({
      actionType: 'save_prediction',
      success: false,
      error: locale === 'es' ? 'Partido no encontrado' : 'Match not found',
    });
  }

  const homeTeam = queriesService.getTeamById(match.homeTeamId);
  const awayTeam = queriesService.getTeamById(match.awayTeamId);

  const hasExactScore = homeScore !== undefined && awayScore !== undefined;
  const predictionText = hasExactScore
    ? `${homeTeam?.name[locale]} ${homeScore} - ${awayScore} ${awayTeam?.name[locale]}`
    : simplePrediction === 'home'
      ? homeTeam?.name[locale]
      : simplePrediction === 'away'
        ? awayTeam?.name[locale]
        : locale === 'es'
          ? 'Empate'
          : 'Draw';

  return Promise.resolve({
    actionType: 'save_prediction',
    success: true,
    artifact: {
      type: 'embed',
      data: {
        embedType: 'prediction_confirmed',
        embedData: {
          matchId: match.id,
          homeTeam: {
            id: homeTeam?.id,
            name: homeTeam?.name[locale],
            flag: homeTeam?.flag,
            code: homeTeam?.code,
          },
          awayTeam: {
            id: awayTeam?.id,
            name: awayTeam?.name[locale],
            flag: awayTeam?.flag,
            code: awayTeam?.code,
          },
          matchDate: match.dateTimeUTC,
          prediction: {
            simplePrediction,
            homeScore: homeScore ?? null,
            awayScore: awayScore ?? null,
            isExactScore: hasExactScore,
            displayText: predictionText,
          },
          points: hasExactScore ? 3 : 1,
          message:
            locale === 'es'
              ? `✅ Predicción: ${predictionText}`
              : `✅ Prediction: ${predictionText}`,
        },
      },
    },
  });
}

// ============================================
// BRACKET SHARE (Mundial 2026 only)
// ============================================

function handleGenerateBracketShare(
  input: Record<string, unknown>,
  queriesService: QueriesService,
  locale: Locale,
): Promise<ActionResult> {
  const championId = input.championId as string;
  const runnerUpId = input.runnerUpId as string | undefined;
  const userName = input.userName as string | undefined;

  const champion = queriesService.getTeamById(championId);
  if (!champion) {
    return Promise.resolve({
      actionType: 'generate_share_image',
      success: false,
      error: locale === 'es' ? 'Equipo no encontrado' : 'Team not found',
    });
  }

  const runnerUp = runnerUpId ? queriesService.getTeamById(runnerUpId) : null;

  // Build OG image URL params
  const ogParams = new URLSearchParams();
  ogParams.set('winner', champion.name[locale]);
  ogParams.set('winnerFlag', champion.flag);
  if (runnerUp) {
    ogParams.set('runner', runnerUp.name[locale]);
    ogParams.set('runnerFlag', runnerUp.flag);
  }
  ogParams.set('locale', locale);
  if (userName) {
    ogParams.set('name', userName);
  }

  const ogImageUrl = `/api/worldcup/og-prediction?${ogParams.toString()}`;

  // Build share URL
  const shareParams = new URLSearchParams();
  shareParams.set('winner', championId);
  if (runnerUpId) shareParams.set('runner', runnerUpId);
  const shareUrl = `https://futbolify.com/${locale}/donde-ver/mundial-2026/pronostico?${shareParams.toString()}`;

  return Promise.resolve({
    actionType: 'generate_share_image',
    success: true,
    artifact: {
      type: 'embed',
      data: {
        embedType: 'bracket_share',
        embedData: {
          champion: {
            id: champion.id,
            name: champion.name[locale],
            flag: champion.flag,
            code: champion.code,
          },
          runnerUp: runnerUp
            ? {
                id: runnerUp.id,
                name: runnerUp.name[locale],
                flag: runnerUp.flag,
                code: runnerUp.code,
              }
            : null,
          userName,
          ogImageUrl,
          shareUrl,
          title:
            locale === 'es'
              ? `Mi pronóstico: ${champion.name[locale]} campeón del Mundial 2026`
              : `My prediction: ${champion.name[locale]} World Cup 2026 champion`,
        },
      },
    },
  });
}

// Helper: Generate ICS calendar file content
function generateICS(matches: MatchData[], title: string, locale: Locale): string {
  const formatDate = (d: Date): string => {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escapeText = (text: string): string => {
    return text.replace(/[,;\\]/g, (match) => '\\' + match).replace(/\n/g, '\\n');
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Futbolify//Football Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(title)}`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const match of matches) {
    const startDate = new Date(`${match.date}T${match.time || '00:00'}:00Z`);
    const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours

    const summary = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
    const description = [
      match.league?.name || 'Football Match',
      match.venue || '',
      '',
      `https://futbolify.com/${locale}/futbol`,
    ].filter(Boolean).join('\\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:futbolify-${match.id}@futbolify.com`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${formatDate(startDate)}`,
      `DTEND:${formatDate(endDate)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `LOCATION:${escapeText(match.venue || '')}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(summary)} ${locale === 'es' ? 'comienza en 30 minutos' : 'starts in 30 minutes'}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
