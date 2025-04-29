import { TimelineEventDto } from '../dto'
import {
  MatchStatistics,
  TeamStat,
} from '../interfaces/match-statistics.interface'

/**
 * Calcula el minuto actual del partido
 * @param match Datos del partido
 * @returns Minuto actual
 */
export function calculateMinute(match: any): number {
  const now = Math.floor(Date.now() / 1000)
  const startTimestamp = match.startTimestamp
  const currentPeriodStart = match.time?.currentPeriodStartTimestamp
  const lastPeriod = match.lastPeriod

  if (!startTimestamp || !currentPeriodStart) {
    return 0
  }

  const elapsedSeconds = now - currentPeriodStart
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)

  if (lastPeriod === 'period2') {
    return 45 + Math.max(elapsedMinutes, 0)
  }

  if (lastPeriod === 'period1') {
    return Math.max(elapsedMinutes, 0)
  }

  if (lastPeriod === 'extra1') {
    return 90 + Math.max(elapsedMinutes, 0)
  }

  if (lastPeriod === 'extra2') {
    return 105 + Math.max(elapsedMinutes, 0)
  }

  if (lastPeriod === 'penalties') {
    return 120
  }

  return Math.max(elapsedMinutes, 0)
}

/**
 * Construye la línea de tiempo de eventos del partido
 * @param incidents Eventos del partido
 * @param homeTeamName Nombre del equipo local
 * @param awayTeamName Nombre del equipo visitante
 * @returns Lista de eventos en la línea de tiempo
 */
export function buildTimeline(
  incidents: any[],
  homeTeamName: string,
  awayTeamName: string
): TimelineEventDto[] {
  const timeline: TimelineEventDto[] = []

  if (!incidents || !Array.isArray(incidents)) return timeline

  for (const incident of incidents) {
    // Verificar que incident sea un objeto válido
    if (!incident || typeof incident !== 'object') continue

    const incidentType = incident.incidentType || ''

    // Expandir los tipos de incidentes que rastreamos
    if (
      [
        'goal',
        'card',
        'substitution',
        'injury',
        'var',
        'corner_kick',
        'shot_on_target',
        'shot_off_target',
      ].includes(incidentType)
    ) {
      timeline.push({
        type: mapIncidentType(incidentType),
        detail: incident.reason || incident.incidentType || '',
        team: incident.isHome ? homeTeamName : awayTeamName,
        player: incident.player?.name ?? '',
        assist: incident.assist1?.name ?? null,
        minute: incident.time || 0,
        isHome: !!incident.isHome,
        importance: calculateEventImportance(incidentType),
      })
    }
  }

  return timeline.sort((a, b) => a.minute - b.minute)
}

/**
 * Extrae y procesa las estadísticas de un partido
 * @param statisticsData Datos de estadísticas del partido
 * @returns Estadísticas procesadas
 */
export function takeStatisticsSnapshot(statisticsData: any): MatchStatistics {
  // Valores iniciales
  let totalShots = { home: 0, away: 0 }
  let shotsOnTarget = { home: 0, away: 0 }
  let shotsOffTarget = { home: 0, away: 0 }
  let blockedShots = { home: 0, away: 0 }
  let shotsInsideBox = { home: 0, away: 0 }
  let shotsOutsideBox = { home: 0, away: 0 }
  let cornersHome = 0
  let cornersAway = 0
  let dangerousAttacks = { home: 0, away: 0 }
  let possession = { home: 50, away: 50 }
  let attacks = { home: 0, away: 0 }
  let bigChances = { home: 0, away: 0 }
  let bigChancesScored = { home: 0, away: 0 }
  let bigChancesMissed = { home: 0, away: 0 }
  let xG = { home: 0, away: 0 }
  let fouls = { home: 0, away: 0 }
  let passes = { home: 0, away: 0 }
  let accuratePasses = { home: 0, away: 0 }
  let duelsWon = { home: 0, away: 0 }
  let saves = { home: 0, away: 0 }
  let hitWoodwork = { home: 0, away: 0 }
  let finalThirdEntries = { home: 0, away: 0 }

  // Buscamos específicamente los datos de todo el partido (período "ALL")
  const allPeriodStats = statisticsData.statistics?.find(
    (period) => period.period === 'ALL'
  )

  // Si no encontramos el período "ALL", usamos todo lo disponible
  const allStatistics = allPeriodStats
    ? [allPeriodStats]
    : statisticsData.statistics || []

  for (const period of allStatistics) {
    const groups = period.groups || []

    for (const group of groups) {
      const items = group.statisticsItems || []

      for (const stat of items) {
        // Obtener el nombre y valores de manera segura
        const name = stat.name || ''

        // Para el caso común de valores directos
        const homeValue = parseValue(stat.homeValue)
        const awayValue = parseValue(stat.awayValue)

        // Procesar según el nombre de la estadística
        switch (name) {
          case 'Total shots':
            totalShots.home = homeValue
            totalShots.away = awayValue
            break

          case 'Shots on target':
            shotsOnTarget.home = homeValue
            shotsOnTarget.away = awayValue
            break

          case 'Shots off target':
            shotsOffTarget.home = homeValue
            shotsOffTarget.away = awayValue
            break

          case 'Blocked shots':
            blockedShots.home = homeValue
            blockedShots.away = awayValue
            break

          case 'Shots inside box':
            shotsInsideBox.home = homeValue
            shotsInsideBox.away = awayValue
            break

          case 'Shots outside box':
            shotsOutsideBox.home = homeValue
            shotsOutsideBox.away = awayValue
            break

          case 'Corner kicks':
            cornersHome = homeValue
            cornersAway = awayValue
            break

          case 'Ball possession':
            // Manejamos el caso de posesión formato "68%"
            possession.home = homeValue || 50
            possession.away = awayValue || 50
            break

          case 'Attacks':
          case 'Dangerous attacks':
            dangerousAttacks.home = homeValue
            dangerousAttacks.away = awayValue
            break

          case 'Big chances':
            bigChances.home = homeValue
            bigChances.away = awayValue
            break

          case 'Big chances scored':
            bigChancesScored.home = homeValue
            bigChancesScored.away = awayValue
            break

          case 'Big chances missed':
            bigChancesMissed.home = homeValue
            bigChancesMissed.away = awayValue
            break

          case 'Expected goals (xG)':
            xG.home = homeValue
            xG.away = awayValue
            break

          case 'Fouls':
            fouls.home = homeValue
            fouls.away = awayValue
            break

          case 'Passes':
            passes.home = homeValue
            passes.away = awayValue
            break

          case 'Accurate passes':
            accuratePasses.home = homeValue
            accuratePasses.away = awayValue
            break

          case 'Duels':
            duelsWon.home = homeValue || 50
            duelsWon.away = awayValue || 50
            break

          case 'Total saves':
          case 'Goalkeeper saves':
            saves.home = homeValue
            saves.away = awayValue
            break

          case 'Hit woodwork':
            hitWoodwork.home = homeValue
            hitWoodwork.away = awayValue
            break

          case 'Final third entries':
            finalThirdEntries.home = homeValue
            finalThirdEntries.away = awayValue
            break
        }
      }
    }
  }

  // Calcular métricas adicionales
  const totalShotsSum = totalShots.home + totalShots.away
  const shotsOnTargetSum = shotsOnTarget.home + shotsOnTarget.away
  const shotsOnTargetRatio =
    totalShotsSum > 0 ? shotsOnTargetSum / totalShotsSum : 0

  // Calcular "peligrosidad" basada en tiros dentro del área vs fuera
  const dangerFactor =
    shotsInsideBox.home + shotsInsideBox.away > 0
      ? (shotsInsideBox.home + shotsInsideBox.away) / (totalShotsSum || 1)
      : 0.5

  return {
    totalShots: totalShotsSum,
    totalShotsTeams: totalShots,
    shotsOnTarget: shotsOnTargetSum,
    shotsOnTargetTeams: shotsOnTarget,
    shotsOffTargetTeams: shotsOffTarget,
    shotsInsideBoxTeams: shotsInsideBox,
    shotsOutsideBoxTeams: shotsOutsideBox,
    shotsOnTargetRatio,
    dangerFactor,
    dangerousAttacks: dangerousAttacks.home + dangerousAttacks.away,
    dangerousAttacksTeams: dangerousAttacks,
    cornersHome,
    cornersAway,
    possession,
    attacks,
    bigChancesTeams: bigChances,
    bigChancesScoredTeams: bigChancesScored,
    bigChancesMissedTeams: bigChancesMissed,
    fouls,
    finalThirdEntries,
    blockedShots,
    hitWoodwork,
    xG,
    possessionDifference: Math.abs(possession.home - possession.away),
    shotsInsideBoxRatio:
      (shotsInsideBox.home + shotsInsideBox.away) / (totalShotsSum || 1),
  }
}

/**
 * Mapea los tipos de incidentes a nombres legibles
 * @param incidentType Tipo de incidente
 * @returns Nombre legible del tipo de incidente
 */
function mapIncidentType(incidentType: string): string {
  const typeMap = {
    goal: 'Goal',
    card: 'Card',
    substitution: 'Substitution',
    injury: 'Injury',
    var: 'VAR',
    corner_kick: 'Corner',
    shot_on_target: 'Shot on Target',
    shot_off_target: 'Shot',
    dangerous_attack: 'Dangerous Attack',
  }

  return typeMap[incidentType] || 'Other'
}

/**
 * Calcula la importancia de un evento
 * @param incidentType Tipo de incidente
 * @returns Valor de importancia (0-5)
 */
function calculateEventImportance(incidentType: string): number {
  const importanceMap = {
    goal: 5,
    card: 1,
    substitution: 1,
    injury: 1,
    var: 2,
    corner_kick: 3,
    shot_on_target: 4,
    shot_off_target: 2,
    dangerous_attack: 1,
  }

  return importanceMap[incidentType] || 0
}

/**
 * Parsea un valor a número
 * @param value Valor a parsear
 * @returns Número parseado o 0 si no es válido
 */
function parseValue(value: any): number {
  if (value === null || value === undefined) return 0

  if (typeof value === 'number') return value

  if (typeof value === 'string') {
    // Manejo de "52%" o "22/30 (73%)"
    const percentMatch = value.match(/(\d+)%/)
    if (percentMatch) return parseInt(percentMatch[1])

    // Manejo de valores fraccionarios como "22/30"
    const fractionMatch = value.match(/(\d+)\/(\d+)/)
    if (fractionMatch) return parseInt(fractionMatch[1])

    // Intenta convertir cualquier otro string a número
    const numValue = parseInt(value)
    if (!isNaN(numValue)) return numValue
  }

  return 0
}
