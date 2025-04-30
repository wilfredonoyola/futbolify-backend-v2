import { TimelineEventDto } from '../dto'
import {
  MatchStatistics,
  TeamStat,
} from '../interfaces/match-statistics.interface'
import axios, { AxiosInstance } from 'axios'
import { ConfigService } from '@nestjs/config'

export async function makeRequestWithFallback<T>(
  requestFn: (api: AxiosInstance) => Promise<T>,
  configService: ConfigService,
  attempts = 3
): Promise<T> {
  const useRapid = configService.get<string>('USE_RAPIDAPI_SOFA') === 'true'

  const rapidApi = axios.create({
    baseURL: 'https://sofascore.p.rapidapi.com',
    headers: {
      'X-RapidAPI-Key': configService.get<string>('RAPIDAPI_KEY_SOFA') || '',
      'X-RapidAPI-Host': 'sofascore.p.rapidapi.com',
    },
    timeout: 5000,
  })

  const directApi = axios.create({
    baseURL: 'https://api.sofascore.com/api/v1',
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
    timeout: 5000,
  })

  try {
    if (useRapid) {
      return await requestFn(rapidApi)
    } else {
      return await requestFn(directApi)
    }
  } catch (error: any) {
    const status = error.response?.status
    if (useRapid && [401, 403, 429].includes(status)) {
      console.warn(
        `⚠️ RapidAPI falló con ${status}, usando fallback directo...`
      )
      return await requestFn(directApi)
    }
    throw error
  }
}

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

  if (lastPeriod === 'period2') return 45 + Math.max(elapsedMinutes, 0)
  if (lastPeriod === 'period1') return Math.max(elapsedMinutes, 0)
  if (lastPeriod === 'extra1') return 90 + Math.max(elapsedMinutes, 0)
  if (lastPeriod === 'extra2') return 105 + Math.max(elapsedMinutes, 0)
  if (lastPeriod === 'penalties') return 120

  return Math.max(elapsedMinutes, 0)
}

export function buildTimeline(
  incidents: any[],
  homeTeamName: string,
  awayTeamName: string
): TimelineEventDto[] {
  const timeline: TimelineEventDto[] = []
  if (!Array.isArray(incidents)) return timeline

  for (const incident of incidents) {
    if (!incident || typeof incident !== 'object') continue

    const incidentType = incident.incidentType || incident.type || ''

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
        'dangerous_attack',
      ].includes(incidentType)
    ) {
      timeline.push({
        type: mapIncidentType(incidentType),
        detail: incident.reason || incident.incidentType || '',
        team: incident.isHome ? homeTeamName : awayTeamName,
        player: incident.player?.name ?? '',
        assist: incident.assist1?.name ?? null,
        minute:
          typeof incident.time === 'object'
            ? incident.time.minute || 0
            : incident.time || 0,
        isHome: !!incident.isHome,
        importance: calculateEventImportance(incidentType),
      })
    }
  }

  return timeline.sort((a, b) => a.minute - b.minute)
}

export function takeStatisticsSnapshot(statisticsData: any): MatchStatistics {
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
  let yellowCards = { home: 0, away: 0 }
  let redCards = { home: 0, away: 0 }
  let offsides = { home: 0, away: 0 }

  const allPeriodStats = statisticsData.statistics?.find(
    (period) => period.period === 'ALL'
  )

  const allStatistics = allPeriodStats
    ? [allPeriodStats]
    : statisticsData.statistics || []

  for (const period of allStatistics) {
    const groups = period.groups || []
    for (const group of groups) {
      const items = group.statisticsItems || []
      for (const stat of items) {
        const key = stat.name || stat.key || ''
        const homeValue = parseValue(stat.homeValue)
        const awayValue = parseValue(stat.awayValue)

        switch (key) {
          case 'Total shots':
          case 'totalShotsOnGoal':
            totalShots.home = homeValue
            totalShots.away = awayValue
            break
          case 'Shots on target':
          case 'shotsOnGoal':
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
          case 'ballPossession':
            possession.home = homeValue || 50
            possession.away = awayValue || 50
            break
          case 'Dangerous attacks':
            dangerousAttacks.home = homeValue
            dangerousAttacks.away = awayValue
            break
          case 'Attacks':
            attacks.home = homeValue
            attacks.away = awayValue
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
          case 'Duels':
            duelsWon.home = homeValue || 50
            duelsWon.away = awayValue || 50
            break
          case 'Total saves':
          case 'Goalkeeper saves':
            saves.home = homeValue
            saves.away = awayValue
            break
          case 'Final third entries':
            finalThirdEntries.home = homeValue
            finalThirdEntries.away = awayValue
            break
          case 'Hit woodwork':
            hitWoodwork.home = homeValue
            hitWoodwork.away = awayValue
            break
          case 'Yellow cards':
            yellowCards.home = homeValue
            yellowCards.away = awayValue
            break
          case 'Red cards':
            redCards.home = homeValue
            redCards.away = awayValue
            break
          case 'Offsides':
            offsides.home = homeValue
            offsides.away = awayValue
            break
        }
      }
    }
  }

  const totalShotsSum = totalShots.home + totalShots.away
  const shotsOnTargetSum = shotsOnTarget.home + shotsOnTarget.away
  const shotsOnTargetRatio =
    totalShotsSum > 0 ? shotsOnTargetSum / totalShotsSum : 0
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
    shotsOffTargetTotal: shotsOffTarget.home + shotsOffTarget.away,
    shotsInsideBoxTeams: shotsInsideBox,
    shotsOutsideBoxTeams: shotsOutsideBox,
    shotsOnTargetRatio,
    dangerFactor,
    dangerousAttacks: dangerousAttacks.home + dangerousAttacks.away,
    dangerousAttacksTeams: dangerousAttacks,
    cornersHome,
    cornersAway,
    possession,
    possessionDifference: Math.abs(possession.home - possession.away),
    attacks,
    bigChancesTeams: bigChances,
    bigChancesScoredTeams: bigChancesScored,
    bigChancesMissedTeams: bigChancesMissed,
    xG,
    fouls,
    finalThirdEntries,
    blockedShots,
    hitWoodwork,
    shotsInsideBoxRatio:
      (shotsInsideBox.home + shotsInsideBox.away) / (totalShotsSum || 1),
    yellowCards,
    redCards,
    offsides,
  }
}

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

function parseValue(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const percentMatch = value.match(/(\d+)%/)
    if (percentMatch) return parseInt(percentMatch[1])

    const fractionMatch = value.match(/(\d+)\/(\d+)/)
    if (fractionMatch) return parseInt(fractionMatch[1])

    const mixedMatch = value.match(/\((\d+)%\)/)
    if (mixedMatch) return parseInt(mixedMatch[1])

    const numValue = parseInt(value)
    if (!isNaN(numValue)) return numValue
  }
  return 0
}
