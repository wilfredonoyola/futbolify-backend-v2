// 📁 src/matches/dto/sofascore-api.dto.ts

// ✅ Entrada de estadísticas de partido desde SofaScore
export interface SofaScoreStatsResponse {
  statistics: SofaScoreStatPeriod[]
}

export interface SofaScoreStatPeriod {
  period: string
  groups: SofaScoreStatGroup[]
}

export interface SofaScoreStatGroup {
  groupName: string
  statisticsItems: SofaScoreStatItem[]
}

export interface SofaScoreStatItem {
  name: string
  home: string | number
  away: string | number
  homeValue: string | number
  awayValue: string | number
  key?: string
  statisticsType?: string
  valueType?: string
  compareCode?: number
  renderType?: number
}

// ✅ Entrada de timeline (incidents)
export interface SofaScoreIncidentsResponse {
  incidents: SofaScoreIncident[]
}

export interface SofaScoreIncident {
  incidentType: string
  reason?: string
  isHome: boolean
  time: number
  player?: { name: string }
  assist1?: { name: string }
}

// ✅ DTO simplificado que devuelve tu snapshot parser
export interface SimplifiedStatsDto {
  totalShots: number
  shotsOnTarget: number
  dangerousAttacks: number
  cornersHome: number
  cornersAway: number

  // Nuevos campos extendidos
  yellowCards: {
    home: number
    away: number
  }
  redCards: {
    home: number
    away: number
  }
  offsides: {
    home: number
    away: number
  }
  shotsOffTargetTeams: {
    home: number
    away: number
  }
}

// ✅ Tipos específicos usados en el servicio
export type FetchMatchStatisticsResponse = SofaScoreStatsResponse
export type FetchMatchTimelineResponse = SofaScoreIncidentsResponse
