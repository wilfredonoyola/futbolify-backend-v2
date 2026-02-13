import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { AnthropicService } from './anthropic.service'
import { ApiFootballService } from './api-football.service'
import { OddsApiService } from './odds-api.service'
import { LEAGUES } from './constants/leagues'
import {
  GoalGuruLeagueDto,
  GoalGuruMatchDto,
  MatchContextDto,
  AnalysisResultDto,
  GoalGuruPickDto,
  GoalGuruStatsDto,
  MatchContextInput,
  AnalyzeMatchesInput,
  MarkResultInput,
} from './dto'
import {
  GoalGuruPick,
  GoalGuruPickDocument,
  PickResult,
} from './schemas/goal-guru-pick.schema'
import {
  GoalGuruSession,
  GoalGuruSessionDocument,
} from './schemas/goal-guru-session.schema'

@Injectable()
export class GoalGuruService {
  private readonly logger = new Logger(GoalGuruService.name)

  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly apiFootballService: ApiFootballService,
    private readonly oddsApiService: OddsApiService,
    @InjectModel(GoalGuruPick.name)
    private pickModel: Model<GoalGuruPickDocument>,
    @InjectModel(GoalGuruSession.name)
    private sessionModel: Model<GoalGuruSessionDocument>
  ) {}

  getLeagues(): GoalGuruLeagueDto[] {
    return LEAGUES.map((league) => ({
      id: league.id,
      name: league.name,
      flag: league.flag,
      search: league.search,
    }))
  }

  async findMatches(leagueId: string): Promise<GoalGuruMatchDto[]> {
    const league = LEAGUES.find((l) => l.id === leagueId)
    if (!league) {
      throw new NotFoundException(`League ${leagueId} not found`)
    }

    // ✅ Use API-Football for REAL fixtures
    this.logger.log(`🔍 Fetching real fixtures for ${league.name} from API-Football`)
    const fixtures = await this.apiFootballService.getUpcomingFixtures(leagueId)

    if (fixtures.length > 0) {
      this.logger.log(`✅ Found ${fixtures.length} real fixtures from API-Football`)
      return fixtures
    }

    // Fallback to Anthropic web_search if API-Football fails or returns empty
    this.logger.warn(`⚠️ No fixtures from API-Football, falling back to web_search`)
    
    const prompt = `Search for today's and this week's upcoming football matches in ${league.name}. Find REAL fixtures with dates, times, and teams.

Return ONLY a JSON array (no extra text):
[{"home":"Team","away":"Team","date":"date","time":"HH:MM","comp":"${league.name}"}]

Return up to 8 matches. If none today, return the next upcoming matchday. Only real scheduled matches.`

    const result = await this.anthropicService.callAI<GoalGuruMatchDto[]>(
      prompt,
      true // use web_search
    )

    return result || []
  }

  async getMatchContext(
    input: MatchContextInput
  ): Promise<MatchContextDto | null> {
    this.logger.log(`🔍 Getting REAL data for ${input.home} vs ${input.away}`)
    
    try {
      // 1. Get REAL odds from The Odds API
      const odds = await this.oddsApiService.getMatchOdds(input.home, input.away)
      this.logger.log(`✅ Real odds: Home ${odds?.homeWin} Draw ${odds?.draw} Away ${odds?.awayWin}`)

      // 2. Search team IDs
      const [homeTeamId, awayTeamId] = await Promise.all([
        this.apiFootballService.searchTeam(input.home),
        this.apiFootballService.searchTeam(input.away),
      ])

      let homeStats = null
      let awayStats = null
      let h2h = null
      let homeInjuries = []
      let awayInjuries = []

      // 3. Get REAL team stats if we found team IDs
      if (homeTeamId && awayTeamId) {
        const leagueId = this.getLeagueIdFromName(input.leagueName)
        const season = new Date().getFullYear()

        ;[homeStats, awayStats, h2h, homeInjuries, awayInjuries] = await Promise.all([
          this.apiFootballService.getTeamStats(homeTeamId, leagueId, season),
          this.apiFootballService.getTeamStats(awayTeamId, leagueId, season),
          this.apiFootballService.getH2H(homeTeamId, awayTeamId, 10),
          this.apiFootballService.getInjuries(homeTeamId),
          this.apiFootballService.getInjuries(awayTeamId),
        ])

        this.logger.log(`✅ Real stats loaded for both teams`)
        this.logger.log(`✅ H2H: ${h2h?.team1Wins}-${h2h?.draws}-${h2h?.team2Wins}`)
        this.logger.log(`✅ Injuries: ${homeInjuries.length + awayInjuries.length} players out`)
      }

      // 4. Build context with REAL data + AI for what we don't have
      const realDataSummary = `
DATOS REALES DE APIs:

ODDS (The Odds API):
- Home Win: ${odds?.homeWin || 'N/A'}
- Draw: ${odds?.draw || 'N/A'}
- Away Win: ${odds?.awayWin || 'N/A'}
- Bookmakers: ${odds?.bookmakers.join(', ') || 'Fallback'}

${homeStats ? `
${input.home} STATS (API-Football):
- Forma: ${homeStats.form}
- Goles favor: ${homeStats.goalsFor} (${homeStats.avgGoalsScored}/partido)
- Goles contra: ${homeStats.goalsAgainst} (${homeStats.avgGoalsConceded}/partido)
- Porterías a cero: ${homeStats.cleanSheets}
- Casa: ${homeStats.homeRecord.wins}W-${homeStats.homeRecord.draws}D-${homeStats.homeRecord.losses}L
` : ''}

${awayStats ? `
${input.away} STATS (API-Football):
- Forma: ${awayStats.form}
- Goles favor: ${awayStats.goalsFor} (${awayStats.avgGoalsScored}/partido)
- Goles contra: ${awayStats.goalsAgainst} (${awayStats.avgGoalsConceded}/partido)
- Porterías a cero: ${awayStats.cleanSheets}
- Fuera: ${awayStats.awayRecord.wins}W-${awayStats.awayRecord.draws}D-${awayStats.awayRecord.losses}L
` : ''}

${h2h ? `
H2H (últimos ${h2h.totalMatches} enfrentamientos):
- ${input.home}: ${h2h.team1Wins} victorias
- ${input.away}: ${h2h.team2Wins} victorias
- Empates: ${h2h.draws}
- Promedio goles: ${h2h.avgGoals}
- Últimos resultados: ${h2h.lastResults.join(', ')}
` : ''}

${homeInjuries.length > 0 || awayInjuries.length > 0 ? `
LESIONES/SUSPENSIONES:
${homeInjuries.map(i => `- ${input.home}: ${i.player} (${i.type})`).join('\n')}
${awayInjuries.map(i => `- ${input.away}: ${i.player} (${i.type})`).join('\n')}
` : 'Sin lesiones reportadas'}
`

      const prompt = `Analiza este partido con los DATOS REALES que tengo:

${input.home} vs ${input.away}
Fecha: ${input.date}
Liga: ${input.leagueName}

${realDataSummary}

Completa la info que falta buscando en web:
- Posición en tabla y puntos
- Contexto (qué está en juego, motivación)
- Odds de mercados de goles si no los tengo
- Tendencias estadísticas clave

Return ONLY JSON:
{
  "homePos":"position and points",
  "awayPos":"position and points",
  "homeForm":"${homeStats?.form || 'WLDWW'}",
  "awayForm":"${awayStats?.form || 'DLWLD'}",
  "homeGoals":"${homeStats ? `${homeStats.goalsFor}/${homeStats.goalsAgainst}` : 'scored/conceded'}",
  "awayGoals":"${awayStats ? `${awayStats.goalsFor}/${awayStats.goalsAgainst}` : 'scored/conceded'}",
  "h2h":"${h2h ? `${h2h.team1Wins}-${h2h.draws}-${h2h.team2Wins}, avg ${h2h.avgGoals} goles` : 'recent head to head summary'}",
  "injuries":"${homeInjuries.length + awayInjuries.length > 0 ? homeInjuries.concat(awayInjuries).map(i => `${i.player} (${i.type})`).join(', ') : 'key injuries both teams'}",
  "context":"what's at stake, motivation, tactical notes, 3-4 sentences",
  "odds":{"o25":1.80,"u25":2.00,"btts_y":1.75,"btts_n":2.05,"o15":1.25,"o35":3.40,"g1h":1.45},
  "keyStats":"2-3 key statistical trends relevant to goals based on REAL data above"
}`

      return await this.anthropicService.callAI<MatchContextDto>(prompt, true)
    } catch (error) {
      this.logger.error(`Error getting match context: ${error.message}`)
      // Fallback to pure AI search if APIs fail
      return this.getMatchContextFallback(input)
    }
  }

  /**
   * Fallback to pure AI search if APIs fail
   */
  private async getMatchContextFallback(
    input: MatchContextInput
  ): Promise<MatchContextDto | null> {
    const prompt = `Search for detailed pre-match analysis data for: ${input.home} vs ${input.away} (${input.leagueName}) on ${input.date}.

I need REAL current data. Search for:
- Current league position and points for both teams
- Recent form (last 5 results)  
- Goals scored and conceded this season
- Head to head recent history
- Key injuries and suspensions
- Current betting odds for goal markets (over/under, BTTS)
- Any important context (what's at stake, motivation, etc.)

Return ONLY JSON:
{
  "homePos":"position and points",
  "awayPos":"position and points",
  "homeForm":"WLDWW",
  "awayForm":"DLWLD",
  "homeGoals":"scored/conceded",
  "awayGoals":"scored/conceded",
  "h2h":"recent head to head summary with goal stats",
  "injuries":"key injuries both teams",
  "context":"what's at stake, motivation, tactical notes, 3-4 sentences",
  "odds":{"o25":1.80,"u25":2.00,"btts_y":1.75,"btts_n":2.05,"o15":1.25,"o35":3.40,"g1h":1.45},
  "keyStats":"2-3 key statistical trends relevant to goals"
}`

    return await this.anthropicService.callAI<MatchContextDto>(prompt, true)
  }

  /**
   * Helper to get league ID from name
   */
  private getLeagueIdFromName(leagueName: string): number {
    const mapping: Record<string, number> = {
      'Premier League': 39,
      'La Liga': 140,
      'Serie A': 135,
      'Bundesliga': 78,
      'Ligue 1': 61,
      'Liga MX': 262,
      'UEFA Champions League': 2,
      'Copa Libertadores': 13,
    }
    return mapping[leagueName] || 39
  }

  async tripleAnalysis(
    input: AnalyzeMatchesInput
  ): Promise<AnalysisResultDto | null> {
    const { matches, contexts, leagueName } = input

    const matchData = matches
      .map((m, i) => {
        const c = contexts[i]
        return `${m.home} vs ${m.away} (${m.date} ${m.time})
${
  c
    ? `Pos: ${c.homePos} vs ${c.awayPos} | Forma: ${c.homeForm} vs ${c.awayForm}
Goles: ${c.homeGoals} vs ${c.awayGoals} | H2H: ${c.h2h}
Lesiones: ${c.injuries} | Contexto: ${c.context}
Odds: O2.5:${c.odds?.o25 || '?'} U2.5:${c.odds?.u25 || '?'} BTTS:${c.odds?.btts_y || '?'} O1.5:${c.odds?.o15 || '?'} O3.5:${c.odds?.o35 || '?'} G1H:${c.odds?.g1h || '?'}
Stats: ${c.keyStats}`
    : 'Contexto no disponible'
}`
      })
      .join('\n\n---\n\n')

    // Layer 1: Statistical analysis
    const l1Prompt = `Analista ESTADÍSTICO puro de fútbol. Solo números y probabilidades. ${matches.length} partidos de ${leagueName}:\n\n${matchData}\n\nPara cada partido calcula xG estimado, probabilidad Over 2.5, BTTS, y si las odds tienen valor.\nJSON sin backticks:\n{"analisis":[{"match":"X vs Y","xg_total":2.3,"prob_o25":55,"prob_btts":50,"valor":"mercado con mejor valor","nota":"1 frase"}]}`
    const l1 = await this.anthropicService.callAI(l1Prompt, false)

    // Layer 2: Context and psychology
    const l2Prompt = `Analista de CONTEXTO y PSICOLOGÍA deportiva. ${matches.length} partidos de ${leagueName}:\n\n${matchData}\n\nPara cada partido evalúa motivación, momentum, táctica, factor cancha, si es partido trampa.\nJSON sin backticks:\n{"analisis":[{"match":"X vs Y","perfil":"ABIERTO/CERRADO/EXPLOSIVO","motivacion":"descripción breve","pick":"mercado sugerido","nota":"1 frase"}]}`
    const l2 = await this.anthropicService.callAI(l2Prompt, false)

    // Layer 3: Master Guru final decision
    const l3Prompt = `Eres el MAESTRO GURÚ de apuestas de goles. 25 años exp. Aciertas 7 de 10.

CAPA 1 ESTADÍSTICA: ${l1 ? JSON.stringify(l1) : 'No disponible'}
CAPA 2 CONTEXTO: ${l2 ? JSON.stringify(l2) : 'No disponible'}
DATOS: ${matchData}

REGLAS:
- Solo apuesta si las capas coinciden
- Máximo 3-4 picks de ${matches.length} partidos
- Si no hay valor, di NO APOSTAR
- Busca VALUE en odds, no lo obvio
- Sé directo y con personalidad

JSON puro sin backticks:
{
  "picks":[{"match":"X vs Y","mercado":"nombre exacto","odds":1.80,"confianza":78,"stake":3,"riesgo":"BAJO/MEDIO/ALTO","capas":"3/3 o 2/3","c1":"estadística dice","c2":"contexto dice","maestro":"tu veredicto 2-3 frases directo","score":"2-1","alt":"alternativa o null","alerta":"riesgo o null"}],
  "skip":[{"match":"X vs Y","razon":"por qué no en 1 frase"}],
  "top":"pick estrella con explicación",
  "parlay":"combinada sugerida o null",
  "bank":"consejo bankroll para hoy"
}`

    return await this.anthropicService.callAI<AnalysisResultDto>(l3Prompt, false)
  }

  async markPickResult(
    userId: string,
    input: MarkResultInput
  ): Promise<GoalGuruPickDto> {
    const profit = input.won
      ? (input.odds - 1) * input.stake * input.unitValue
      : -(input.stake * input.unitValue)

    const pick = new this.pickModel({
      userId,
      match: input.match,
      mercado: input.mercado,
      odds: input.odds,
      confianza: input.confianza,
      stake: input.stake,
      riesgo: input.riesgo,
      result: input.won ? PickResult.WON : PickResult.LOST,
      profit,
      league: input.league,
      resolvedAt: new Date(),
    })

    await pick.save()

    return {
      id: pick._id.toString(),
      userId: pick.userId.toString(),
      sessionId: pick.sessionId?.toString(),
      match: pick.match,
      mercado: pick.mercado,
      odds: pick.odds,
      confianza: pick.confianza,
      stake: pick.stake,
      riesgo: pick.riesgo,
      result: pick.result,
      profit: pick.profit,
      league: pick.league,
      resolvedAt: pick.resolvedAt,
      createdAt: pick.createdAt,
      updatedAt: pick.updatedAt,
    }
  }

  async getHistory(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<GoalGuruPickDto[]> {
    const picks = await this.pickModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec()

    return picks.map((pick) => ({
      id: pick._id.toString(),
      userId: pick.userId.toString(),
      sessionId: pick.sessionId?.toString(),
      match: pick.match,
      mercado: pick.mercado,
      odds: pick.odds,
      confianza: pick.confianza,
      stake: pick.stake,
      riesgo: pick.riesgo,
      result: pick.result,
      profit: pick.profit,
      league: pick.league,
      resolvedAt: pick.resolvedAt,
      createdAt: pick.createdAt,
      updatedAt: pick.updatedAt,
    }))
  }

  async getStats(userId: string): Promise<GoalGuruStatsDto> {
    const picks = await this.pickModel.find({ userId }).exec()

    const totalBets = picks.length
    const wins = picks.filter((p) => p.result === PickResult.WON).length
    const losses = picks.filter((p) => p.result === PickResult.LOST).length
    const totalProfit = picks.reduce((sum, p) => sum + p.profit, 0)
    const totalInvested = picks.reduce(
      (sum, p) => sum + (p.result === PickResult.LOST ? Math.abs(p.profit) : 0),
      0
    )

    const winRate = totalBets > 0 ? (wins / totalBets) * 100 : 0
    const roi = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0

    return {
      totalBets,
      wins,
      losses,
      winRate,
      totalProfit,
      roi,
    }
  }

  async clearHistory(userId: string): Promise<boolean> {
    await this.pickModel.deleteMany({ userId }).exec()
    return true
  }
}
