// Action handlers for World Cup 2026 AI Chat - Execute actions and return artifacts

import { QueriesService } from '../queries/queries.service';
import { QuinielaService } from '../../quiniela/quiniela.service';
import { PredictionMode } from '../../quiniela/schemas/quiniela.schema';
import { STAGES } from './constants';
import type {
  Locale,
  ActionResult,
  GenerateCalendarParams,
  GenerateShareImageParams,
  CreateQuinielaParams,
  GenerateBracketShareParams,
  SetReminderParams,
  SavePredictionParams,
} from './types';

// ============================================
// CALENDAR GENERATION
// ============================================

export function handleGenerateCalendar(
  params: GenerateCalendarParams,
  queriesService: QueriesService,
  locale: Locale,
): ActionResult {
  try {
    const { teamId, matchIds, title } = params;

    // Get matches - either by team or by specific IDs
    let matches: ReturnType<QueriesService['getAllMatches']> = [];
    let calendarTitle = title || '';

    if (teamId) {
      const team = queriesService.getTeamById(teamId);
      if (!team) {
        return {
          success: false,
          actionType: 'generate_calendar',
          error:
            locale === 'es'
              ? `No encontré el equipo "${teamId}"`
              : `Team "${teamId}" not found`,
        };
      }
      matches = queriesService.getMatchesByTeam(teamId);
      calendarTitle = title || `${team.name[locale]} - Mundial 2026`;
    } else if (matchIds && matchIds.length > 0) {
      matches = matchIds
        .map((id) => queriesService.getMatchById(id))
        .filter((m): m is NonNullable<typeof m> => m !== null);
      calendarTitle = title || 'Mundial 2026';
    } else {
      // Default to upcoming matches
      matches = queriesService
        .getAllMatches()
        .filter((m) => new Date(m.dateTimeUTC) > new Date())
        .slice(0, 10);
      calendarTitle = title || 'Mundial 2026 - Próximos partidos';
    }

    if (matches.length === 0) {
      return {
        success: false,
        actionType: 'generate_calendar',
        error: locale === 'es' ? 'No hay partidos para agregar' : 'No matches to add',
      };
    }

    // Generate ICS content
    const icsContent = generateICSContent(matches, calendarTitle, queriesService, locale);
    const filename = `futbolify-${calendarTitle
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')}.ics`;

    return {
      success: true,
      actionType: 'generate_calendar',
      artifact: {
        type: 'file',
        filename,
        mimeType: 'text/calendar',
        data: Buffer.from(icsContent).toString('base64'),
        embedType: 'calendar_ready',
        embedData: {
          title: calendarTitle,
          matchCount: matches.length,
          matches: matches.slice(0, 5).map((m) => {
            const home = queriesService.getTeamById(m.homeTeamId);
            const away = queriesService.getTeamById(m.awayTeamId);
            return {
              id: m.id,
              title: `${home?.name[locale] || m.homeTeamId} vs ${away?.name[locale] || m.awayTeamId}`,
              date: m.dateTimeUTC,
              homeFlag: home?.flag,
              awayFlag: away?.flag,
            };
          }),
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      actionType: 'generate_calendar',
      error: `Error: ${error}`,
    };
  }
}

function generateICSContent(
  matches: ReturnType<QueriesService['getAllMatches']>,
  calendarName: string,
  queriesService: QueriesService,
  locale: Locale,
): string {
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escapeText = (text: string): string => {
    return text.replace(/[,;\\]/g, (match) => '\\' + match).replace(/\n/g, '\\n');
  };

  let ics =
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Futbolify//World Cup 2026//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeText(calendarName)}`,
      'X-WR-TIMEZONE:UTC',
    ].join('\r\n') + '\r\n';

  for (const match of matches) {
    const homeTeam = queriesService.getTeamById(match.homeTeamId);
    const awayTeam = queriesService.getTeamById(match.awayTeamId);
    const venue = queriesService.getVenueById(match.venueId);

    const start = new Date(match.dateTimeUTC);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2 hours
    const uid = `worldcup2026-${match.id}@futbolify.com`;

    const title = `${homeTeam?.name[locale] || match.homeTeamId} vs ${awayTeam?.name[locale] || match.awayTeamId}`;
    const stageName = STAGES[match.stage]?.[locale] || match.stage;

    const description = [
      `FIFA World Cup 2026`,
      stageName,
      match.groupId ? `Grupo ${match.groupId.toUpperCase()}` : '',
      '',
      locale === 'es' ? 'Donde ver:' : 'Where to watch:',
      `https://futbolify.com/${locale}/donde-ver/mundial-2026/partido/${match.slug[locale]}`,
    ]
      .filter(Boolean)
      .join('\\n');

    const location = venue
      ? `${venue.name}, ${venue.city[locale]}, ${venue.country}`
      : '';

    ics +=
      [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${formatDate(new Date())}`,
        `DTSTART:${formatDate(start)}`,
        `DTEND:${formatDate(end)}`,
        `SUMMARY:${escapeText(title)}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${escapeText(location)}`,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'BEGIN:VALARM',
        'TRIGGER:-PT30M',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(title)} ${locale === 'es' ? 'comienza en 30 minutos' : 'starts in 30 minutes'}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n') + '\r\n';
  }

  ics += 'END:VCALENDAR';
  return ics;
}

// ============================================
// SHAREABLE IMAGE GENERATION
// ============================================

export function handleGenerateShareImage(
  params: GenerateShareImageParams,
  queriesService: QueriesService,
  locale: Locale,
): ActionResult {
  const { type, teamId, matchId, prediction, title } = params;

  // Build image data based on type
  const imageData: Record<string, unknown> = {
    type,
    locale,
    title: title || (locale === 'es' ? 'Mundial 2026' : 'World Cup 2026'),
    generatedAt: new Date().toISOString(),
  };

  if (type === 'schedule' && teamId) {
    const team = queriesService.getTeamById(teamId);
    if (!team) {
      return {
        success: false,
        actionType: 'generate_share_image',
        error: locale === 'es' ? 'Equipo no encontrado' : 'Team not found',
      };
    }

    const matches = queriesService.getMatchesByTeam(teamId).slice(0, 5);
    imageData.team = {
      id: team.id,
      name: team.name[locale],
      flag: team.flag,
      code: team.code,
    };
    imageData.matches = matches.map((m) => {
      const home = queriesService.getTeamById(m.homeTeamId);
      const away = queriesService.getTeamById(m.awayTeamId);
      const venue = queriesService.getVenueById(m.venueId);
      return {
        homeTeam: { name: home?.name[locale], flag: home?.flag },
        awayTeam: { name: away?.name[locale], flag: away?.flag },
        date: m.dateTimeUTC,
        venue: venue?.name,
        stage: STAGES[m.stage]?.[locale] || m.stage,
      };
    });
    imageData.title = title || `${team.name[locale]} - Mundial 2026`;
  }

  if (type === 'single_match' && matchId) {
    const match = queriesService.getMatchById(matchId);
    if (!match) {
      return {
        success: false,
        actionType: 'generate_share_image',
        error: locale === 'es' ? 'Partido no encontrado' : 'Match not found',
      };
    }

    const home = queriesService.getTeamById(match.homeTeamId);
    const away = queriesService.getTeamById(match.awayTeamId);
    const venue = queriesService.getVenueById(match.venueId);

    imageData.match = {
      homeTeam: { name: home?.name[locale], flag: home?.flag, code: home?.code },
      awayTeam: { name: away?.name[locale], flag: away?.flag, code: away?.code },
      date: match.dateTimeUTC,
      venue: { name: venue?.name, city: venue?.city[locale] },
      stage: STAGES[match.stage]?.[locale] || match.stage,
    };
  }

  if (type === 'prediction' && prediction) {
    const champion = prediction.champion
      ? queriesService.getTeamById(prediction.champion)
      : null;
    const finalist = prediction.finalist
      ? queriesService.getTeamById(prediction.finalist)
      : null;

    imageData.prediction = {
      champion: champion
        ? { name: champion.name[locale], flag: champion.flag, code: champion.code }
        : null,
      finalist: finalist
        ? { name: finalist.name[locale], flag: finalist.flag, code: finalist.code }
        : null,
    };
    imageData.title =
      title ||
      (locale === 'es' ? 'Mi Predicción Mundial 2026' : 'My World Cup 2026 Prediction');
  }

  return {
    success: true,
    actionType: 'generate_share_image',
    artifact: {
      type: 'embed',
      embedType: 'share_image',
      embedData: imageData,
    },
  };
}

// ============================================
// QUINIELA CREATION
// ============================================

export async function handleCreateQuiniela(
  params: CreateQuinielaParams,
  quinielaService: QuinielaService,
  locale: Locale,
): Promise<ActionResult> {
  const { name, ownerName = 'Organizador', isPrivate = true, anonymousCreatorId: providedId } = params;

  try {
    // Use provided anonymousCreatorId from frontend, or generate fallback if not provided
    const anonymousCreatorId = providedId || `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const result = await quinielaService.createQuiniela(
      {
        name,
        isPrivate,
        anonymousCreatorId,
        ownerName,
        predictionMode: PredictionMode.SIMPLE, // Chat creates simple mode quinielas
      },
      undefined, // No userId (anonymous)
      ownerName,
    );

    return {
      success: true,
      actionType: 'create_quiniela',
      artifact: {
        type: 'embed',
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
          createdAt: new Date().toISOString(),
          rules: {
            exactScore: 5,
            correctResult: 2,
            bonusChampion: 10,
          },
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      actionType: 'create_quiniela',
      error: error instanceof Error ? error.message : 'Failed to create quiniela',
    };
  }
}

// ============================================
// BRACKET SHARE
// ============================================

export function handleGenerateBracketShare(
  params: GenerateBracketShareParams,
  queriesService: QueriesService,
  locale: Locale,
): ActionResult {
  const { championId, runnerUpId, userName } = params;

  const champion = queriesService.getTeamById(championId);
  if (!champion) {
    return {
      success: false,
      actionType: 'generate_share_image',
      error: locale === 'es' ? 'Equipo no encontrado' : 'Team not found',
    };
  }

  const runnerUp = runnerUpId ? queriesService.getTeamById(runnerUpId) : null;

  // Build OG image URL
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

  return {
    success: true,
    actionType: 'generate_share_image',
    artifact: {
      type: 'embed',
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
  };
}

// ============================================
// MATCH REMINDER
// ============================================

export function handleSetReminder(
  params: SetReminderParams,
  queriesService: QueriesService,
  locale: Locale,
): ActionResult {
  const { matchId, minutesBefore = 30 } = params;

  const match = queriesService.getMatchById(matchId);
  if (!match) {
    return {
      success: false,
      actionType: 'set_reminder',
      error: locale === 'es' ? 'Partido no encontrado' : 'Match not found',
    };
  }

  const homeTeam = queriesService.getTeamById(match.homeTeamId);
  const awayTeam = queriesService.getTeamById(match.awayTeamId);

  const reminderLabels: Record<number, Record<Locale, string>> = {
    15: { es: '15 minutos antes', en: '15 minutes before' },
    30: { es: '30 minutos antes', en: '30 minutes before' },
    60: { es: '1 hora antes', en: '1 hour before' },
  };

  return {
    success: true,
    actionType: 'set_reminder',
    artifact: {
      type: 'embed',
      embedType: 'reminder_set',
      embedData: {
        matchId,
        matchTitle: `${homeTeam?.name[locale]} vs ${awayTeam?.name[locale]}`,
        matchDate: match.dateTimeUTC,
        homeFlag: homeTeam?.flag,
        awayFlag: awayTeam?.flag,
        reminderTime: reminderLabels[minutesBefore]?.[locale] || `${minutesBefore} min`,
        minutesBefore,
      },
    },
  };
}

// ============================================
// SAVE PREDICTION
// ============================================

export function handleSavePrediction(
  params: SavePredictionParams,
  queriesService: QueriesService,
  locale: Locale,
): ActionResult {
  const { matchId, homeTeamId, awayTeamId, simplePrediction, homeScore, awayScore } = params;

  // Find match by ID or by team IDs
  let match = matchId ? queriesService.getMatchById(matchId) : null;

  if (!match && homeTeamId && awayTeamId) {
    // Find match by teams
    const allMatches = queriesService.getUpcomingMatches(20);
    match = allMatches.find(
      (m) =>
        (m.homeTeamId === homeTeamId && m.awayTeamId === awayTeamId) ||
        (m.homeTeamId === awayTeamId && m.awayTeamId === homeTeamId),
    );
  }

  if (!match) {
    return {
      success: false,
      actionType: 'save_prediction',
      error: locale === 'es' ? 'Partido no encontrado' : 'Match not found',
    };
  }

  const homeTeam = queriesService.getTeamById(match.homeTeamId);
  const awayTeam = queriesService.getTeamById(match.awayTeamId);

  // Build prediction data
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

  return {
    success: true,
    actionType: 'save_prediction',
    artifact: {
      type: 'embed',
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
  };
}

// ============================================
// MAIN DISPATCHER
// ============================================

export async function executeAction(
  toolName: string,
  toolInput: Record<string, unknown>,
  queriesService: QueriesService,
  quinielaService: QuinielaService,
  locale: Locale,
  anonymousCreatorId?: string, // Passed from frontend localStorage
): Promise<ActionResult | null> {
  switch (toolName) {
    case 'generate_calendar_file':
      return handleGenerateCalendar(
        toolInput as GenerateCalendarParams,
        queriesService,
        locale,
      );

    case 'generate_shareable_image':
      return handleGenerateShareImage(
        toolInput as unknown as GenerateShareImageParams,
        queriesService,
        locale,
      );

    case 'create_quiniela':
      // Inject anonymousCreatorId from frontend if provided
      return handleCreateQuiniela(
        { ...toolInput, anonymousCreatorId } as unknown as CreateQuinielaParams,
        quinielaService,
        locale,
      );

    case 'set_match_reminder':
      return handleSetReminder(
        toolInput as unknown as SetReminderParams,
        queriesService,
        locale,
      );

    case 'generate_bracket_share':
      return handleGenerateBracketShare(
        toolInput as unknown as GenerateBracketShareParams,
        queriesService,
        locale,
      );

    case 'save_prediction':
      return handleSavePrediction(
        toolInput as unknown as SavePredictionParams,
        queriesService,
        locale,
      );

    default:
      return null;
  }
}
