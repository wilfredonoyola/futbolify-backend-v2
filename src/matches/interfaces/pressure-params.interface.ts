import { TeamStat } from './match-statistics.interface'

export interface PressureScoreParams {
  // Métricas básicas
  totalShots: number
  shotsOnTarget: number
  dangerousAttacks: number
  corners: number

  // Métricas avanzadas
  totalShotsTeams?: TeamStat
  shotsOnTargetTeams?: TeamStat
  shotsInsideBoxTeams?: TeamStat
  shotsOnTargetRatio?: number
  possession?: TeamStat
  possessionDifference?: number
  bigChancesTeams?: TeamStat
  attacks?: TeamStat
  xG?: TeamStat
  dangerFactor?: number
  shotsInsideBoxRatio?: number

  // Contexto del partido
  minute: number
  lastEventTypes?: string[]
  scoreHome?: number
  scoreAway?: number
}

export interface MatchStateParams {
  minute: number
  scoreHome: number
  scoreAway: number
  pressureScore: number
  isGoodForOver05: boolean
  isGoodForOver15: boolean
  lastPeriod?: string
  isLateMatch?: boolean
}
