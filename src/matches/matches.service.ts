import { Injectable, Logger } from '@nestjs/common'
import {
  LiveMatchOutputDto,
  LateMatchOptionsDto,
  MatchState,
  LeagueStandingsDto,
  AvailableLeagueDto,
  FootballSearchKind,
  FootballSearchResultDto,
  PlayerProfileDto,
  PlayerSeasonStatDto,
  MatchLineupsDto,
  TeamLineupDto,
  LineupPlayerDto,
} from './dto'
import {
  ApiFootballLiveService,
  LiveMatchData,
  MatchLineupsRaw,
  TeamLineupRaw,
  LineupPlayerRaw,
} from './api-football-live.service'
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
    dto.homeTeamLogo = match.homeTeamLogo
    dto.awayTeamLogo = match.awayTeamLogo
    dto.kickoffTime = match.kickoffTime
    dto.leagueId = match.leagueId
    dto.leagueName = match.leagueName
    dto.leagueLogo = match.leagueLogo
    dto.minute = match.minute
    dto.scoreHome = match.scoreHome
    dto.scoreAway = match.scoreAway
    dto.state = this.calculateState(match.status, match.minute)
    dto.round = match.round

    // Statistics from detailed match data
    if (match.statistics) {
      dto.possession = match.statistics.possession
      dto.shotsSplit = match.statistics.shots
      dto.shotsOnTargetSplit = match.statistics.shotsOnTarget
      dto.cornersSplit = match.statistics.corners
      dto.foulsSplit = match.statistics.fouls
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

    if (match.lineups) {
      dto.lineups = this.mapLineupsToDto(match.lineups)
    }

    dto.marketAvailable = true
    return dto
  }

  private mapLineupsToDto(raw: MatchLineupsRaw): MatchLineupsDto {
    const dto = new MatchLineupsDto()
    if (raw.home) {
      dto.home = this.mapTeamLineupToDto(raw.home)
    }
    if (raw.away) {
      dto.away = this.mapTeamLineupToDto(raw.away)
    }
    return dto
  }

  private mapTeamLineupToDto(t: TeamLineupRaw): TeamLineupDto {
    const d = new TeamLineupDto()
    d.teamName = t.teamName
    d.teamLogo = t.teamLogo ?? undefined
    d.formation = t.formation ?? undefined
    d.coachName = t.coachName ?? undefined
    d.startXI = t.startXI.map((p) => this.mapLineupPlayerToDto(p))
    d.substitutes = t.substitutes.map((p) => this.mapLineupPlayerToDto(p))
    return d
  }

  private mapLineupPlayerToDto(p: LineupPlayerRaw): LineupPlayerDto {
    const x = new LineupPlayerDto()
    x.id = p.id
    x.name = p.name
    x.number = p.number ?? undefined
    x.pos = p.pos ?? undefined
    x.grid = p.grid ?? undefined
    return x
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

  /**
   * Get matches by league ID (live + upcoming + optional recent finished).
   * Underlying API-Football calls are Redis-cached in ApiFootballLiveService.
   *
   * @param leagueId - Frontend league ID (e.g. 'premier-league', 'la-liga')
   * @param status - 'all' | 'live' | 'upcoming' | 'finished'
   */
  async getMatchesByLeague(
    leagueId: string,
    status: string = 'all'
  ): Promise<LiveMatchOutputDto[]> {
    try {
      if (status === 'live') {
        const live = await this.apiFootballService.getLiveMatchesByLeague(leagueId)
        return live.map((m) => this.transformToDto(m))
      }

      if (status === 'upcoming') {
        const upcoming = await this.apiFootballService.getUpcomingMatchesByLeague(leagueId)
        return upcoming.map((m) => this.transformToDto(m))
      }

      if (status === 'finished') {
        const finished = await this.apiFootballService.getFinishedMatchesByLeague(leagueId)
        return finished.map((m) => this.transformToDto(m))
      }

      // status === 'all' — merge sources, dedupe by fixture id, stable sort
      const [liveRaw, upcomingRaw, finishedRaw] = await Promise.all([
        this.apiFootballService.getLiveMatchesByLeague(leagueId),
        this.apiFootballService.getUpcomingMatchesByLeague(leagueId),
        this.apiFootballService.getFinishedMatchesByLeague(leagueId),
      ])

      const byId = new Map<number, LiveMatchOutputDto>()

      const put = (list: LiveMatchData[]) => {
        for (const m of list) {
          const dto = this.transformToDto(m)
          if (!byId.has(dto.id)) {
            byId.set(dto.id, dto)
          }
        }
      }

      put(liveRaw)
      put(upcomingRaw)
      put(finishedRaw)

      const merged = Array.from(byId.values())
      merged.sort((a, b) => {
        const order = (s: MatchState) => {
          if (s === MatchState.NotStarted) return 0
          if (s === MatchState.Finished) return 2
          return 1
        }
        const oa = order(a.state)
        const ob = order(b.state)
        if (oa !== ob) return oa - ob
        const ta = new Date(a.kickoffTime || 0).getTime()
        const tb = new Date(b.kickoffTime || 0).getTime()
        return ta - tb
      })

      this.logger.log(
        `📊 ${leagueId} all: ${merged.length} unique (live ${liveRaw.length}, upcoming ${upcomingRaw.length}, finished ${finishedRaw.length})`
      )
      return merged
    } catch (error) {
      this.logger.error(`❌ Error getting matches for ${leagueId}: ${error.message}`)
      return []
    }
  }

  /**
   * Partidos de un día (YYYY-MM-DD), opcionalmente filtrados por liga (slug).
   */
  async getFixturesByDate(
    date: string,
    leagueId?: string
  ): Promise<LiveMatchOutputDto[]> {
    try {
      const raw = await this.apiFootballService.getFixturesByDate(date, leagueId)
      return raw.map((m) => this.transformToDto(m))
    } catch (error) {
      this.logger.error(`getFixturesByDate: ${error.message}`)
      return []
    }
  }

  /**
   * Búsqueda de jugadores y equipos (API-Football).
   */
  async searchFootball(
    query: string,
    limit = 8
  ): Promise<FootballSearchResultDto[]> {
    try {
      const hits = await this.apiFootballService.searchFootball(query, limit)
      return hits.map((h) => {
        const dto = new FootballSearchResultDto()
        dto.kind =
          h.kind === 'team' ? FootballSearchKind.TEAM : FootballSearchKind.PLAYER
        dto.id = h.id
        dto.name = h.name
        dto.photo = h.photo
        dto.meta = h.meta
        return dto
      })
    } catch (error) {
      this.logger.error(`searchFootball: ${error.message}`)
      return []
    }
  }

  /**
   * Ficha de jugador + estadísticas por competición en una temporada.
   */
  async getPlayerProfile(
    playerId: number,
    season?: number
  ): Promise<PlayerProfileDto | null> {
    try {
      const raw = await this.apiFootballService.getPlayerProfile(playerId, season)
      if (!raw) return null

      const dto = new PlayerProfileDto()
      dto.id = raw.id
      dto.name = raw.name
      dto.firstname = raw.firstname
      dto.lastname = raw.lastname
      dto.photo = raw.photo
      dto.nationality = raw.nationality
      dto.birthPlace = raw.birthPlace
      dto.birthDate = raw.birthDate
      dto.height = raw.height
      dto.teamId = raw.teamId
      dto.teamName = raw.teamName
      dto.teamLogo = raw.teamLogo
      dto.seasonStats = raw.seasonStats.map((s) => {
        const st = new PlayerSeasonStatDto()
        st.leagueId = s.leagueId
        st.leagueName = s.leagueName
        st.appearances = s.appearances
        st.lineups = s.lineups
        st.goals = s.goals
        st.assists = s.assists
        st.minutes = s.minutes
        return st
      })
      return dto
    } catch (error) {
      this.logger.error(`getPlayerProfile: ${error.message}`)
      return null
    }
  }
}
