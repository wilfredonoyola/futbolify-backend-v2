/**
 * Types for match event detection system
 */

export enum MatchEventType {
  // High priority - immediate notification
  GOAL = 'GOAL',
  RED_CARD = 'RED_CARD',
  PENALTY = 'PENALTY',
  OWN_GOAL = 'OWN_GOAL',
  VAR_GOAL_CANCELLED = 'VAR_GOAL_CANCELLED',
  VAR_GOAL_CONFIRMED = 'VAR_GOAL_CONFIRMED',
  VAR_PENALTY = 'VAR_PENALTY',

  // Medium priority
  MATCH_START = 'MATCH_START',
  MATCH_END = 'MATCH_END',
  HALF_TIME = 'HALF_TIME',
  SECOND_HALF_START = 'SECOND_HALF_START',
  EXTRA_TIME_START = 'EXTRA_TIME_START',
  PENALTY_SHOOTOUT_START = 'PENALTY_SHOOTOUT_START',

  // Low priority - optional notifications
  YELLOW_CARD = 'YELLOW_CARD',
  SUBSTITUTION = 'SUBSTITUTION',
  MISSED_PENALTY = 'MISSED_PENALTY',
}

export interface MatchEvent {
  id: string
  fixtureId: number
  type: MatchEventType
  timestamp: Date
  minute: number
  team: 'home' | 'away'
  teamName: string
  player?: string
  assist?: string
  detail?: string
  // Score at the moment of event
  scoreHome: number
  scoreAway: number
  // Match info
  homeTeam: string
  awayTeam: string
  leagueId?: string
  leagueName?: string
}

export interface MatchState {
  fixtureId: number
  homeTeam: string
  awayTeam: string
  scoreHome: number
  scoreAway: number
  status: string // NS, 1H, HT, 2H, FT, etc.
  minute: number
  leagueId?: string
  leagueName?: string
  leagueLogo?: string
  events: MatchEventSnapshot[]
  lastUpdated: Date
}

export interface MatchEventSnapshot {
  type: string
  team: string
  player?: string
  minute: number
  detail?: string
}

export interface EventDetectionResult {
  fixtureId: number
  newEvents: MatchEvent[]
  stateChanged: boolean
}

/**
 * Priority levels for notifications
 */
export const EVENT_PRIORITY: Record<MatchEventType, 'high' | 'medium' | 'low'> = {
  [MatchEventType.GOAL]: 'high',
  [MatchEventType.RED_CARD]: 'high',
  [MatchEventType.PENALTY]: 'high',
  [MatchEventType.OWN_GOAL]: 'high',
  [MatchEventType.VAR_GOAL_CANCELLED]: 'high',
  [MatchEventType.VAR_GOAL_CONFIRMED]: 'high',
  [MatchEventType.VAR_PENALTY]: 'high',
  [MatchEventType.MATCH_START]: 'medium',
  [MatchEventType.MATCH_END]: 'medium',
  [MatchEventType.HALF_TIME]: 'medium',
  [MatchEventType.SECOND_HALF_START]: 'medium',
  [MatchEventType.EXTRA_TIME_START]: 'medium',
  [MatchEventType.PENALTY_SHOOTOUT_START]: 'medium',
  [MatchEventType.YELLOW_CARD]: 'low',
  [MatchEventType.SUBSTITUTION]: 'low',
  [MatchEventType.MISSED_PENALTY]: 'low',
}

/**
 * Notification templates for each event type
 */
export const EVENT_TEMPLATES: Record<MatchEventType, { es: string; en: string }> = {
  [MatchEventType.GOAL]: {
    es: '⚽ ¡GOOOL! {player} ({team}) - {home} {scoreHome}-{scoreAway} {away}',
    en: '⚽ GOAAL! {player} ({team}) - {home} {scoreHome}-{scoreAway} {away}',
  },
  [MatchEventType.OWN_GOAL]: {
    es: '⚽ Autogol de {player} - {home} {scoreHome}-{scoreAway} {away}',
    en: '⚽ Own goal by {player} - {home} {scoreHome}-{scoreAway} {away}',
  },
  [MatchEventType.RED_CARD]: {
    es: '🟥 Expulsado: {player} ({team}) - {home} vs {away}',
    en: '🟥 Red card: {player} ({team}) - {home} vs {away}',
  },
  [MatchEventType.PENALTY]: {
    es: '⚽ ¡PENAL convertido! {player} ({team}) - {home} {scoreHome}-{scoreAway} {away}',
    en: '⚽ PENALTY scored! {player} ({team}) - {home} {scoreHome}-{scoreAway} {away}',
  },
  [MatchEventType.MISSED_PENALTY]: {
    es: '❌ Penal fallado: {player} ({team}) - {home} vs {away}',
    en: '❌ Penalty missed: {player} ({team}) - {home} vs {away}',
  },
  [MatchEventType.VAR_GOAL_CANCELLED]: {
    es: '❌ VAR: Gol anulado - {home} vs {away}',
    en: '❌ VAR: Goal cancelled - {home} vs {away}',
  },
  [MatchEventType.VAR_GOAL_CONFIRMED]: {
    es: '✅ VAR: Gol confirmado - {home} {scoreHome}-{scoreAway} {away}',
    en: '✅ VAR: Goal confirmed - {home} {scoreHome}-{scoreAway} {away}',
  },
  [MatchEventType.VAR_PENALTY]: {
    es: '⚠️ VAR: Penal señalado - {home} vs {away}',
    en: '⚠️ VAR: Penalty awarded - {home} vs {away}',
  },
  [MatchEventType.MATCH_START]: {
    es: '🏁 ¡Comenzó! {home} vs {away}',
    en: '🏁 Kick-off! {home} vs {away}',
  },
  [MatchEventType.MATCH_END]: {
    es: '🔚 Final: {home} {scoreHome}-{scoreAway} {away}',
    en: '🔚 Full time: {home} {scoreHome}-{scoreAway} {away}',
  },
  [MatchEventType.HALF_TIME]: {
    es: '⏸️ Descanso: {home} {scoreHome}-{scoreAway} {away}',
    en: '⏸️ Half time: {home} {scoreHome}-{scoreAway} {away}',
  },
  [MatchEventType.SECOND_HALF_START]: {
    es: '▶️ Inicia segundo tiempo: {home} vs {away}',
    en: '▶️ Second half starts: {home} vs {away}',
  },
  [MatchEventType.EXTRA_TIME_START]: {
    es: '⏱️ Inicia tiempo extra: {home} vs {away}',
    en: '⏱️ Extra time starts: {home} vs {away}',
  },
  [MatchEventType.PENALTY_SHOOTOUT_START]: {
    es: '🎯 Inician penales: {home} vs {away}',
    en: '🎯 Penalty shootout starts: {home} vs {away}',
  },
  [MatchEventType.YELLOW_CARD]: {
    es: '🟨 Amarilla: {player} ({team})',
    en: '🟨 Yellow card: {player} ({team})',
  },
  [MatchEventType.SUBSTITUTION]: {
    es: '🔄 Cambio en {team}: entra {player}',
    en: '🔄 Substitution for {team}: {player} comes on',
  },
}
