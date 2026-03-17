import { Injectable, Logger } from '@nestjs/common'
import {
  LiveMatchOutputDto,
  LateMatchOptionsDto,
  MatchState,
  LeagueStandingsDto,
  AvailableLeagueDto,
} from './dto'
import { ApiFootballLiveService, LiveMatchData } from './api-football-live.service'
import { OpenAiAnalysisService } from './openai-analysis.service'
import { shouldAnalyzeWithGPT } from './utils/match-relevance.util'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name)

  constructor(
    private readonly apiFootballService: ApiFootballLiveService,
    private readonly openAiAnalysisService: OpenAiAnalysisService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Transform LiveMatchData to LiveMatchOutputDto
   */
  private transformToDto(match: LiveMatchData): LiveMatchOutputDto {
    const dto = new LiveMatchOutputDto()
    dto.id = match.id
    dto.homeTeam = match.homeTeam
    dto.awayTeam = match.awayTeam
    dto.leagueId = match.leagueId
    dto.leagueName = match.leagueName
    dto.leagueLogo = match.leagueLogo
    dto.minute = match.minute
    dto.scoreHome = match.scoreHome
    dto.scoreAway = match.scoreAway
    dto.state = this.calculateState(match.status, match.minute)

    // Statistics from detailed match data
    if (match.statistics) {
      dto.possession = match.statistics.possession
      dto.shots = (match.statistics.shots?.home ?? 0) + (match.statistics.shots?.away ?? 0)
      dto.shotsOnTarget =
        (match.statistics.shotsOnTarget?.home ?? 0) +
        (match.statistics.shotsOnTarget?.away ?? 0)
      dto.corners =
        (match.statistics.corners?.home ?? 0) + (match.statistics.corners?.away ?? 0)
    }

    // Timeline from events
    if (match.events && match.events.length > 0) {
      dto.timeline = match.events.map((event) => ({
        type: this.mapEventType(event.type),
        detail: event.detail,
        team: event.team,
        player: event.player,
        minute: event.time,
        isHome: event.team === match.homeTeam,
        importance: this.getEventImportance(event.type),
      }))
      dto.hasRecentActivity = match.events.some(
        (e) => e.time >= match.minute - 5
      )
      dto.lastEventType = match.events[match.events.length - 1]?.type || null
    }

    dto.marketAvailable = true
    return dto
  }

  /**
   * Calculate match state from API-Football status
   */
  private calculateState(status: string, minute: number): MatchState {
    switch (status) {
      case 'NS':
        return MatchState.NotStarted
      case '1H':
        return MatchState.FirstHalf
      case 'HT':
        return MatchState.HalfTime
      case '2H':
        return MatchState.SecondHalf
      case 'ET':
      case 'P':
        return MatchState.SecondHalf
      case 'FT':
      case 'AET':
      case 'PEN':
        return MatchState.Finished
      case 'SUSP':
      case 'INT':
      case 'PST':
      case 'CANC':
      case 'ABD':
        return MatchState.NotStarted
      default:
        // Fallback based on minute
        if (minute < 1) return MatchState.NotStarted
        if (minute < 45) return MatchState.FirstHalf
        if (minute >= 45 && minute < 50) return MatchState.HalfTime
        if (minute >= 50 && minute < 95) return MatchState.SecondHalf
        return MatchState.Finished
    }
  }

  /**
   * Map API-Football event types to our types
   */
  private mapEventType(type: string): string {
    const typeMap: Record<string, string> = {
      Goal: 'goal',
      Card: 'card',
      Subst: 'substitution',
      Var: 'var',
    }
    return typeMap[type] || type.toLowerCase()
  }

  /**
   * Get event importance for UI highlighting
   */
  private getEventImportance(type: string): number {
    const importanceMap: Record<string, number> = {
      Goal: 10,
      Card: 5,
      Var: 7,
      Subst: 2,
    }
    return importanceMap[type] || 1
  }

  /**
   * Get all live matches (uses API-Football with Redis cache)
   */
  async getLiveMatchesSimple(): Promise<LiveMatchOutputDto[]> {
    try {
      const liveMatches = await this.apiFootballService.getLiveMatches()

      if (!liveMatches.length) {
        this.logger.log('❌ No hay partidos en vivo.')
        return []
      }

      this.logger.log(`✅ ${liveMatches.length} partidos en vivo detectados.`)

      return liveMatches.map((match) => this.transformToDto(match))
    } catch (error) {
      this.logger.error(`❌ Error trayendo partidos LIVE: ${error.message}`)
      return []
    }
  }

  /**
   * Get late matches (65+ minutes) with optional GPT analysis
   */
  async getLateMatches(
    options: LateMatchOptionsDto = {}
  ): Promise<LiveMatchOutputDto[]> {
    try {
      const { minMinute = 65, maxGoals = 3 } = options

      const liveMatches = await this.apiFootballService.getLiveMatches()

      if (!liveMatches.length) {
        this.logger.log('❌ No hay partidos en vivo para evaluar como tardíos.')
        return []
      }

      // Filter for late matches
      const lateMatches = liveMatches.filter((match) => {
        const totalGoals = match.scoreHome + match.scoreAway
        return (
          match.minute >= minMinute &&
          totalGoals <= maxGoals &&
          match.status === '2H' // Second half
        )
      })

      if (!lateMatches.length) {
        this.logger.log(`❌ No hay partidos tardíos (min >= ${minMinute}).`)
        return []
      }

      this.logger.log(`✅ ${lateMatches.length} partidos tardíos detectados.`)

      // Get detailed data for each match
      const detailedMatches: LiveMatchOutputDto[] = []

      for (const match of lateMatches) {
        const detailed = await this.apiFootballService.getLiveMatchDetails(match.id)
        if (!detailed) continue

        const dto = this.transformToDto(detailed)

        // Calculate pressure score based on stats
        if (detailed.statistics) {
          const stats = detailed.statistics
          const totalShots =
            (stats.shots?.home ?? 0) + (stats.shots?.away ?? 0)
          const shotsOnTarget =
            (stats.shotsOnTarget?.home ?? 0) + (stats.shotsOnTarget?.away ?? 0)
          const corners =
            (stats.corners?.home ?? 0) + (stats.corners?.away ?? 0)

          // Simple pressure score calculation
          dto.pressureScore =
            totalShots * 0.5 + shotsOnTarget * 1.5 + corners * 0.3

          // Determine if good for over goals
          dto.isGoodForOver05 = dto.pressureScore > 8 && match.minute >= 70
          dto.isGoodForOver15 = dto.pressureScore > 12 && match.minute >= 75
        }

        // Optional GPT analysis for high-pressure matches
        if (
          shouldAnalyzeWithGPT({
            minute: match.minute,
            scoreHome: match.scoreHome,
            scoreAway: match.scoreAway,
            pressureScore: dto.pressureScore || 0,
            marketAvailable: true,
          })
        ) {
          try {
            dto.bettingAnalysis = await this.openAiAnalysisService.analyzeMatch({
              id: match.id,
              homeTeam: match.homeTeam,
              awayTeam: match.awayTeam,
              minute: match.minute,
              scoreHome: match.scoreHome,
              scoreAway: match.scoreAway,
              shots: dto.shots || 0,
              shotsOnTarget: dto.shotsOnTarget || 0,
              dangerousAttacks: 0,
              corners: dto.corners || 0,
              xG: 0,
              pressureScore: dto.pressureScore || 0,
              hasRecentActivity: dto.hasRecentActivity || false,
              marketAvailable: true,
              lastEventType: dto.lastEventType || null,
              lastEvents: [],
            })
          } catch (err) {
            this.logger.warn(`GPT analysis failed for match ${match.id}`)
          }
        }

        detailedMatches.push(dto)

        // Small delay between API calls
        await new Promise((res) => setTimeout(res, 200))
      }

      return detailedMatches
    } catch (error) {
      this.logger.error(`❌ Error trayendo partidos TARDÍOS: ${error.message}`)
      return []
    }
  }

  /**
   * Get upcoming matches (today and tomorrow)
   */
  async getUpcomingMatches(): Promise<LiveMatchOutputDto[]> {
    try {
      const upcomingMatches = await this.apiFootballService.getUpcomingMatches()

      if (!upcomingMatches.length) {
        this.logger.log('❌ No hay partidos próximos.')
        return []
      }

      this.logger.log(`✅ ${upcomingMatches.length} partidos próximos encontrados.`)

      return upcomingMatches.map((match) => this.transformToDto(match))
    } catch (error) {
      this.logger.error(`❌ Error trayendo partidos próximos: ${error.message}`)
      return []
    }
  }

  /**
   * Get match by ID
   */
  async getMatchById(id: number): Promise<LiveMatchOutputDto | null> {
    try {
      const match = await this.apiFootballService.getLiveMatchDetails(id)
      if (!match) return null
      return this.transformToDto(match)
    } catch (error) {
      this.logger.error(`Error getting match ${id}: ${error.message}`)
      return null
    }
  }

  /**
   * Get standings for a league (dynamic - works for any league)
   */
  async getStandings(leagueId: string, season?: number): Promise<LeagueStandingsDto | null> {
    try {
      const standings = await this.apiFootballService.getStandings(leagueId, season)
      if (!standings) {
        this.logger.warn(`No standings found for ${leagueId}`)
        return null
      }
      return standings as LeagueStandingsDto
    } catch (error) {
      this.logger.error(`Error getting standings: ${error.message}`)
      return null
    }
  }

  /**
   * Get list of available leagues
   */
  getAvailableLeagues(): AvailableLeagueDto[] {
    return this.apiFootballService.getAvailableLeagues()
  }
}
