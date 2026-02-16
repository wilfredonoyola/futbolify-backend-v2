import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { AnthropicService } from './anthropic.service'
import { ApiFootballService } from './api-football.service'
import { FootballDataService } from './football-data.service'
import { OddsApiService } from './odds-api.service'
import { LEAGUES } from './constants/leagues'
import {
  GoalGuruLeagueDto,
  GoalGuruMatchDto,
  AnalysisResultDto,
} from './dto'

/**
 * G1H Analysis Input - simplified
 */
interface G1HAnalysisInput {
  matches: GoalGuruMatchDto[]
  leagueName: string
}

/**
 * Goal Guru Service
 * Provides league discovery, match fetching, and G1H analysis
 */
@Injectable()
export class GoalGuruService {
  private readonly logger = new Logger(GoalGuruService.name)

  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly apiFootballService: ApiFootballService,
    private readonly footballDataService: FootballDataService,
    private readonly oddsApiService: OddsApiService
  ) {}

  getLeagues(): GoalGuruLeagueDto[] {
    return LEAGUES.map((league) => ({
      id: league.id,
      name: league.name,
      flag: league.flag,
      search: league.search,
      g1hRating: league.g1hRating,
      avgG1H: league.avgG1H,
    }))
  }

  async findMatches(leagueId: string): Promise<GoalGuruMatchDto[]> {
    const league = LEAGUES.find((l) => l.id === leagueId)
    if (!league) {
      throw new NotFoundException(`League ${leagueId} not found`)
    }

    this.logger.log(`Fetching fixtures for ${league.name}`)

    // 1. Try API-Football first (if we have credits)
    const fixtures = await this.apiFootballService.getUpcomingFixtures(leagueId)
    if (fixtures.length > 0) {
      this.logger.log(`Found ${fixtures.length} fixtures from API-Football`)
      return fixtures
    }

    // 2. Fallback to Football-Data.org (FREE!)
    if (this.footballDataService.isLeagueSupported(leagueId)) {
      this.logger.log(`Trying Football-Data.org fallback for ${league.name}`)
      const footballDataFixtures = await this.footballDataService.getUpcomingFixtures(leagueId)

      if (footballDataFixtures.length > 0) {
        this.logger.log(`Found ${footballDataFixtures.length} fixtures from Football-Data.org`)
        return footballDataFixtures
      }
    }

    // 3. Last resort: AI web search
    this.logger.warn(`No fixtures from APIs, using AI fallback for ${league.name}`)

    const prompt = `Busca los próximos partidos de ${league.name} para hoy y mañana.

Necesito partidos REALES programados. Busca en web la jornada actual.

Devuelve SOLO JSON array (sin texto extra):
[
  {"home":"Equipo Local","away":"Equipo Visitante","date":"15/02","time":"21:00","comp":"${league.name}"}
]

Máximo 8 partidos. Solo partidos confirmados con fecha y hora.`

    const result = await this.anthropicService.callAI<GoalGuruMatchDto[]>(prompt, true)

    if (result && result.length > 0) {
      this.logger.log(`Found ${result.length} fixtures via AI fallback`)
      return result
    }

    this.logger.warn(`No fixtures found for ${league.name}`)
    return []
  }

  /**
   * G1H Analysis - ONE AI call for all matches
   */
  async analyzeG1H(input: G1HAnalysisInput): Promise<AnalysisResultDto | null> {
    const { matches, leagueName } = input
    const startTime = Date.now()

    // Find league info for G1H context
    const leagueInfo = LEAGUES.find(l => l.name === leagueName)
    const g1hRating = leagueInfo?.g1hRating || 'MEDIUM'
    const avgG1H = leagueInfo?.avgG1H || 1.20

    this.logger.log(`G1H Analysis: ${matches.length} matches in ${leagueName} (G1H Rating: ${g1hRating}, Avg: ${avgG1H})`)

    // 1. Get odds for all matches in parallel
    const oddsPromises = matches.map(m =>
      this.oddsApiService.getMatchOdds(m.home, m.away).catch(() => null)
    )
    const allOdds = await Promise.all(oddsPromises)
    this.logger.log(`Odds fetched in ${Date.now() - startTime}ms`)

    // 2. Build match data summary
    const matchSummaries = matches.map((m, i) => {
      const odds = allOdds[i]
      return `${i + 1}. ${m.home} vs ${m.away} (${m.date} ${m.time})
   - Odds 1X2: ${odds?.homeWin || '?'}/${odds?.draw || '?'}/${odds?.awayWin || '?'}
   - G1H odds: buscar`
    }).join('\n\n')

    // 3. ONE AI call - EXPERT G1H analysis
    const leagueContext = g1hRating === 'HIGH'
      ? `LIGA DE ALTO VALOR G1H (${avgG1H} goles/1H promedio) - Esta liga es ideal para G1H`
      : g1hRating === 'MEDIUM'
        ? `LIGA G1H MEDIA (${avgG1H} goles/1H) - Buscar solo los mejores picks`
        : `LIGA TÁCTICA/DEFENSIVA (${avgG1H} goles/1H) - Ser muy selectivo`

    const prompt = `Eres un EXPERTO ESPECIALIZADO en apuestas de GOL EN PRIMERA MITAD (G1H/Over 0.5 FH).

LIGA: ${leagueName}
${leagueContext}

PARTIDOS:
${matchSummaries}

=== CONOCIMIENTO DE EXPERTO G1H ===

ESTADÍSTICAS CLAVE:
- 75% de partidos tienen al menos 1 gol en primera mitad
- 68% de equipos que marcan en 1H ganan el partido
- Equipos de alta presión ganan 68-75% de sus partidos

PATRONES DE VALOR:
1. "FAST STARTERS" - Equipos que marcan >60% de sus goles en 1H
2. "PRESSING INTENSITY" - Equipos de alta presión desde el inicio
3. "DEFENSIVE WEAKNESS" - Rivales que conceden temprano
4. "FHPI SCORE" (First Half Performance Index)

FILTROS DE VALOR (NO apostar si):
- Odds G1H < 1.30 (sin valor)
- Ambos equipos con <50% de partidos con G1H
- Partidos donde ambos necesitan "no perder"

ODDS G1H:
- Valor óptimo: 1.40-1.55
- Aceptable: 1.35-1.60
- Rechazar: <1.30 o >1.70

=== OUTPUT ===

Máximo 2 picks. Si no hay valor claro, devuelve picks vacío.

JSON puro (sin backticks ni markdown):
{
  "picks": [
    {
      "match": "Equipo A vs Equipo B",
      "mercado": "Gol en 1ª Mitad",
      "odds": 1.45,
      "confianza": 68,
      "stake": 2,
      "riesgo": "BAJO",
      "razon": "Stats específicos...",
      "patron": "Fast Starter + Rival concede temprano",
      "g1hStats": {
        "homeG1HPercent": 72,
        "awayConcedeG1HPercent": 65,
        "avgMinuteFirstGoal": 24
      }
    }
  ],
  "skip": [
    {
      "match": "Equipo X vs Equipo Y",
      "razon": "Sin valor"
    }
  ],
  "mejorPick": "Mejor recomendación",
  "alertas": "Verificar odds antes de apostar"
}`

    this.logger.log(`Calling AI for G1H analysis...`)
    const result = await this.anthropicService.callAI<AnalysisResultDto>(prompt, true)

    const totalTime = Date.now() - startTime
    this.logger.log(`G1H Analysis complete in ${totalTime}ms`)

    return result
  }

  /**
   * Analyze a SINGLE match for G1H
   */
  async analyzeSingleMatch(input: {
    match: GoalGuruMatchDto
    leagueName: string
  }): Promise<AnalysisResultDto | null> {
    const { match, leagueName } = input
    const startTime = Date.now()

    const leagueInfo = LEAGUES.find(l => l.name === leagueName)
    const g1hRating = leagueInfo?.g1hRating || 'MEDIUM'
    const avgG1H = leagueInfo?.avgG1H || 1.20

    this.logger.log(`Single G1H Analysis: ${match.home} vs ${match.away} (${g1hRating})`)

    const odds = await this.oddsApiService.getMatchOdds(match.home, match.away).catch(() => null)

    const leagueContext = g1hRating === 'HIGH'
      ? `LIGA DE ALTO VALOR G1H (${avgG1H} goles/1H promedio)`
      : g1hRating === 'MEDIUM'
        ? `LIGA G1H MEDIA (${avgG1H} goles/1H)`
        : `LIGA TÁCTICA (${avgG1H} goles/1H)`

    const prompt = `Analiza ESTE PARTIDO para GOL EN PRIMERA MITAD (G1H).

PARTIDO: ${match.home} vs ${match.away}
FECHA: ${match.date} ${match.time}
LIGA: ${leagueName}
${leagueContext}
ODDS 1X2: ${odds?.homeWin || '?'}/${odds?.draw || '?'}/${odds?.awayWin || '?'}

BUSCA EN WEB:
1. ${match.home} - % partidos con G1H en casa
2. ${match.away} - % partidos donde concede en 1H
3. Promedio goles primera mitad
4. Minuto promedio del primer gol
5. Forma reciente
6. ODDS G1H actuales

CRITERIOS:
- Odds G1H óptimas: 1.40-1.55
- Local con >65% G1H = Fast Starter
- Visitante concede >55% en 1H = Defensa débil

JSON puro:
{
  "picks": [
    {
      "match": "${match.home} vs ${match.away}",
      "mercado": "Gol en 1ª Mitad",
      "odds": 1.45,
      "confianza": 68,
      "stake": 2,
      "riesgo": "BAJO",
      "razon": "Stats encontrados...",
      "patron": "Fast Starter + Defensa débil",
      "g1hStats": {
        "homeG1HPercent": 72,
        "awayConcedeG1HPercent": 65,
        "avgMinuteFirstGoal": 24
      }
    }
  ],
  "skip": [
    {
      "match": "${match.home} vs ${match.away}",
      "razon": "Razón si no hay valor"
    }
  ],
  "mejorPick": "Recomendación o null",
  "alertas": "Verificar odds antes de apostar"
}`

    this.logger.log(`Calling AI for single match analysis...`)
    const result = await this.anthropicService.callAI<AnalysisResultDto>(prompt, true)

    const totalTime = Date.now() - startTime
    this.logger.log(`Single match analysis complete in ${totalTime}ms`)

    return result
  }
}
