export interface TeamStat {
  home: number
  away: number
}

export interface MatchStatistics {
  totalShots: number
  totalShotsTeams: TeamStat
  shotsOnTarget: number
  shotsOnTargetTeams: TeamStat
  shotsOffTargetTeams: TeamStat
  shotsOffTargetTotal: number
  shotsInsideBoxTeams: TeamStat
  shotsOutsideBoxTeams: TeamStat
  shotsOnTargetRatio: number
  dangerFactor: number
  dangerousAttacks: number
  dangerousAttacksTeams: TeamStat
  cornersHome: number
  cornersAway: number

  possession: TeamStat
  possessionDifference: number
  attacks: TeamStat
  bigChancesTeams: TeamStat
  bigChancesScoredTeams: TeamStat
  bigChancesMissedTeams: TeamStat
  xG: TeamStat
  fouls: TeamStat
  blockedShots: TeamStat
  hitWoodwork: TeamStat
  finalThirdEntries: TeamStat
  shotsInsideBoxRatio: number

  yellowCards: TeamStat
  redCards: TeamStat
  offsides: TeamStat
}
