import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  BettingLeague,
  BettingLeagueDocument,
} from '../schemas/betting-league.schema'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import { BettingCombo, BettingComboDocument } from '../schemas/betting-combo.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import { ApiFootballBettingService } from '../services/api-football-betting.service'
import { OddsApiService } from '../services/odds-api.service'
import { ScoringGoalsService } from '../services/scoring-goals.service'
import { ScoringCornersService } from '../services/scoring-corners.service'
import { ContextService } from '../services/context.service'
import { ValueDetectionService } from '../services/value-detection.service'
import { OpenMeteoService, WeatherData } from '../services/open-meteo.service'
import { ComboEngineService, ComboLeg } from '../services/combo-engine.service'
import { PortfolioOptimizerService } from '../services/portfolio-optimizer.service'
import { StakeCalculatorService } from '../services/stake-calculator.service'
import { AntiPatternService, DailyPicksSummary } from '../services/anti-pattern.service'
import { BettingTelegramService } from '../telegram/betting-telegram.service'
import {
  PickStatus,
  ComboStatus,
  MarketType,
  MarketDirection,
  TimeWindow,
} from '../enums/betting.enums'

/**
 * Nightly Analysis Cron Job
 * Runs Friday and Saturday at 9:00 PM El Salvador time
 *
 * Schedule:
 * - Friday 9 PM → Analyze Saturday matches (VENTANA A + B)
 * - Saturday 9 PM → Analyze Sunday matches (VENTANA C)
 *
 * Purpose:
 * - Analyze fixtures across active leagues
 * - Score goals 1H and corners for each match
 * - Detect value bets
 * - Generate intelligent combos
 * - Optimize portfolio
 * - Save picks and combos to database
 * - Send Alert 1 to Telegram
 */
@Injectable()
export class NightlyAnalysisCron {
  private readonly logger = new Logger(NightlyAnalysisCron.name)

  constructor(
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    private apiFootballService: ApiFootballBettingService,
    private oddsApiService: OddsApiService,
    private scoringGoalsService: ScoringGoalsService,
    private scoringCornersService: ScoringCornersService,
    private contextService: ContextService,
    private valueDetectionService: ValueDetectionService,
    private comboEngineService: ComboEngineService,
    private portfolioOptimizerService: PortfolioOptimizerService,
    private stakeCalculatorService: StakeCalculatorService,
    private telegramService: BettingTelegramService,
    private openMeteoService: OpenMeteoService,
    private antiPatternService: AntiPatternService
  ) {}

  /**
   * Generate weather fields for modelInputs
   */
  private getWeatherFields(weather: WeatherData | null, context: any): {
    weatherDescription?: string
    weatherTemp?: number
    weatherWind?: number
    weatherPrecip?: number
    weatherFlags?: string[]
  } {
    if (!weather) {
      return {}
    }

    // Extract weather-related flags from context
    const weatherFlags = context.flags?.filter((flag: string) =>
      ['RAIN', 'HEAVY_RAIN', 'STRONG_WIND', 'EXTREME_WEATHER', 'HOT', 'COLD'].includes(flag)
    ) || []

    return {
      weatherDescription: weather.weatherDescription,
      weatherTemp: weather.temperature,
      weatherWind: weather.windSpeed,
      weatherPrecip: weather.precipitation,
      weatherFlags: weatherFlags.length > 0 ? weatherFlags : undefined,
    }
  }

  /**
   * Calculate star rating based on edge (1-5 stars)
   */
  private calculateStars(edge: number): number {
    if (edge >= 0.15) return 5
    if (edge >= 0.12) return 4
    if (edge >= 0.09) return 3
    if (edge >= 0.07) return 2
    return 1
  }

  /**
   * Generate human-readable reasons for a goals pick
   */
  private generateGoalsReasons(
    market: string,
    teamAStats: any,
    teamBStats: any,
    h2h: any,
    league: any,
    goalsResult: any
  ): string[] {
    const reasons: string[] = []

    // Stats del local
    if (teamAStats) {
      const homeOver05 = teamAStats.home_over05_1h || 0
      if (homeOver05 >= 0.75) {
        reasons.push(`Local marca en 1H en ${Math.round(homeOver05 * 100)}% de partidos`)
      }
      const avgGoals1H = teamAStats.avg_goals_1h || 0
      if (avgGoals1H >= 1.3) {
        reasons.push(`Local promedia ${avgGoals1H.toFixed(1)} goles en 1H`)
      }
    }

    // Stats del visitante
    if (teamBStats) {
      const awayOver05 = teamBStats.away_over05_1h || 0
      if (awayOver05 >= 0.70) {
        reasons.push(`Visitante marca en 1H en ${Math.round(awayOver05 * 100)}% de partidos`)
      }
      const conceded1H = teamBStats.avg_conceded_1h || 0
      if (conceded1H >= 0.8) {
        reasons.push(`Visitante recibe ${conceded1H.toFixed(1)} goles/1H`)
      }
    }

    // H2H
    if (h2h && h2h.last_5_goals_1h > 0) {
      const pct = Math.round((h2h.last_5_goals_1h / 5) * 100)
      if (pct >= 60) {
        reasons.push(`H2H: gol en 1H en ${h2h.last_5_goals_1h} de últimos 5`)
      }
    }

    // Liga
    if (league.tier <= 2) {
      reasons.push(`Liga Tier ${league.tier} (más ineficiencias)`)
    }

    // Expected goals
    if (goalsResult?.expectedGoals1H >= 1.2) {
      reasons.push(`xG 1H: ${goalsResult.expectedGoals1H.toFixed(2)}`)
    }

    // Si no hay razones específicas, agregar una genérica
    if (reasons.length === 0) {
      reasons.push(`Probabilidad modelo: ${Math.round(goalsResult?.probOver05_1H * 100 || 0)}%`)
    }

    return reasons.slice(0, 2) // Máximo 2 razones
  }

  /**
   * Generate human-readable reasons for a corners pick
   */
  private generateCornersReasons(
    market: string,
    teamAStats: any,
    teamBStats: any,
    h2h: any,
    league: any,
    cornersResult: any
  ): string[] {
    const reasons: string[] = []

    // Corners del local
    if (teamAStats) {
      const cornersFor = teamAStats.corners_for_avg || 0
      if (cornersFor >= 5.5) {
        reasons.push(`Local gana ${cornersFor.toFixed(1)} corners/partido`)
      }
    }

    // Corners del visitante
    if (teamBStats) {
      const cornersFor = teamBStats.corners_for_avg || 0
      if (cornersFor >= 5.0) {
        reasons.push(`Visitante gana ${cornersFor.toFixed(1)} corners/partido`)
      }
    }

    // Liga
    const leagueCorners = league.stats?.avgCornersPerMatch || 0
    if (leagueCorners >= 10) {
      reasons.push(`Liga alta en corners (${leagueCorners.toFixed(1)}/partido)`)
    }

    // Expected corners
    if (cornersResult?.cornersExpected >= 10) {
      reasons.push(`Corners esperados: ${cornersResult.cornersExpected.toFixed(1)}`)
    }

    if (reasons.length === 0) {
      reasons.push(`Corners estimados: ${cornersResult?.cornersExpected?.toFixed(1) || '?'}`)
    }

    return reasons.slice(0, 2)
  }

  /**
   * Generate human-readable reasons for a corners handicap pick
   * Explains WHY we chose this pick and HOW to bet it
   */
  private generateHandicapReasons(
    homeTeam: string,
    awayTeam: string,
    expectedLine: number,
    bookmakerLine: number,
    direction: string,
    edge: number,
    probOwn: number,
    teamAStats: any,
    teamBStats: any
  ): string[] {
    const reasons: string[] = []
    const lineDiff = Math.abs(expectedLine - bookmakerLine)
    const edgePct = (edge * 100).toFixed(1)
    const probPct = (probOwn * 100).toFixed(0)

    // Razón principal: la discrepancia entre líneas
    const expectedStr = expectedLine >= 0 ? `+${expectedLine.toFixed(1)}` : expectedLine.toFixed(1)
    const bookmakerStr = bookmakerLine >= 0 ? `+${bookmakerLine.toFixed(1)}` : bookmakerLine.toFixed(1)

    if (direction === 'OVER') {
      // Apostamos al local
      reasons.push(`Modelo: ${homeTeam} ${expectedStr} vs Casa: ${bookmakerStr}`)
      if (teamAStats?.corners_for_avg > teamBStats?.corners_for_avg) {
        reasons.push(`${homeTeam} gana ${teamAStats.corners_for_avg?.toFixed(1) || '?'} corners/partido`)
      }
    } else {
      // Apostamos al visitante
      reasons.push(`Modelo: ${awayTeam} cubre handicap (${bookmakerStr})`)
      if (teamBStats?.corners_for_avg >= 4.5) {
        reasons.push(`${awayTeam} gana ${teamBStats.corners_for_avg?.toFixed(1) || '?'} corners/partido`)
      }
    }

    // Edge y probabilidad
    reasons.push(`Edge: ${edgePct}% | Prob: ${probPct}%`)

    return reasons.slice(0, 3) // Máximo 3 razones para handicap
  }

  /**
   * Friday 9:00 PM El Salvador - Analyze Saturday matches
   */
  @Cron('0 21 * * 5', {
    name: 'betting-nightly-analysis-friday',
    timeZone: 'America/El_Salvador',
  })
  async runFridayNightlyAnalysis(): Promise<void> {
    this.logger.log('Starting Friday nightly analysis for Saturday matches...')
    await this.runNightlyAnalysis('Saturday')
  }

  /**
   * Saturday 9:00 PM El Salvador - Analyze Sunday matches (VENTANA C)
   */
  @Cron('0 21 * * 6', {
    name: 'betting-nightly-analysis-saturday',
    timeZone: 'America/El_Salvador',
  })
  async runSaturdayNightlyAnalysis(): Promise<void> {
    this.logger.log('Starting Saturday nightly analysis for Sunday matches...')
    await this.runNightlyAnalysis('Sunday')
  }

  /**
   * Monday 9:00 PM El Salvador - Analyze Tuesday matches
   * (Champions League, Championship midweek)
   */
  @Cron('0 21 * * 1', {
    name: 'betting-nightly-analysis-monday',
    timeZone: 'America/El_Salvador',
  })
  async runMondayNightlyAnalysis(): Promise<void> {
    this.logger.log('Starting Monday nightly analysis for Tuesday matches...')
    await this.runNightlyAnalysis('Tuesday')
  }

  /**
   * Tuesday 9:00 PM El Salvador - Analyze Wednesday matches
   * (Champions League, Championship midweek)
   */
  @Cron('0 21 * * 2', {
    name: 'betting-nightly-analysis-tuesday',
    timeZone: 'America/El_Salvador',
  })
  async runTuesdayNightlyAnalysis(): Promise<void> {
    this.logger.log('Starting Tuesday nightly analysis for Wednesday matches...')
    await this.runNightlyAnalysis('Wednesday')
  }

  /**
   * Wednesday 9:00 PM El Salvador - Analyze Thursday matches
   * (Europa League, Conference League)
   */
  @Cron('0 21 * * 3', {
    name: 'betting-nightly-analysis-wednesday',
    timeZone: 'America/El_Salvador',
  })
  async runWednesdayNightlyAnalysis(): Promise<void> {
    this.logger.log('Starting Wednesday nightly analysis for Thursday matches...')
    await this.runNightlyAnalysis('Thursday')
  }

  /**
   * Core nightly analysis logic
   */
  private async runNightlyAnalysis(dayLabel: string): Promise<void> {
    this.logger.log(`Starting nightly analysis for ${dayLabel} matches...`)
    const startTime = Date.now()

    try {
      // Check if betting is active
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.isActive) {
        this.logger.log('Betting is paused, skipping nightly analysis')
        return
      }

      // Get tomorrow's date
      const tomorrowDate = this.getTomorrowDateString()
      this.logger.log(`Analyzing fixtures for ${dayLabel}: ${tomorrowDate}`)

      // Get active leagues
      const activeLeagues = await this.bettingLeagueModel
        .find({ isActive: true })
        .sort({ tier: 1 })
        .exec()

      this.logger.log(`Found ${activeLeagues.length} active leagues`)

      // Analyze all fixtures and collect value picks
      const allValuePicks: ComboLeg[] = []
      const pickDocuments: Partial<BettingPick>[] = []
      const contexts = new Map<number, any>()
      let fixturesAnalyzed = 0

      for (const league of activeLeagues) {
        const { picks: leaguePicks, fixturesCount } = await this.analyzeLeague(
          league,
          tomorrowDate,
          contexts,
          settings.bankroll
        )

        for (const pick of leaguePicks) {
          allValuePicks.push(pick.leg)
          pickDocuments.push(pick.document)
        }

        fixturesAnalyzed += fixturesCount
      }

      this.logger.log(
        `Analysis complete: ${allValuePicks.length} value picks from ${fixturesAnalyzed} fixtures`
      )

      // PICK SELECTION WITH DIVERSIFICATION:
      // 1. Filter picks with probability >= 60%
      // 2. Sort by probability (higher = better)
      // 3. Max 2 picks per match (fixtureId) for diversification
      // 4. Max 5 picks total
      const maxPicks = 5
      const maxPicksPerMatch = 2
      const minProbability = 0.65 // Minimum 65% win probability

      // Filter picks by minimum probability
      const qualifiedPicks = allValuePicks.filter(
        (pick) => (pick.probOwn || 0) >= minProbability
      )

      this.logger.log(
        `Qualified picks: ${qualifiedPicks.length} of ${allValuePicks.length} have probability >= ${minProbability * 100}%`
      )

      // Sort by probability (higher = better) - all markets equal priority
      const sortedPicks = [...qualifiedPicks].sort((a, b) => {
        return (b.probOwn || 0) - (a.probOwn || 0)
      })

      // Select picks with max 2 per match for diversification
      const topPicks: typeof sortedPicks = []
      const picksPerMatch = new Map<number, number>()

      for (const pick of sortedPicks) {
        if (topPicks.length >= maxPicks) break

        const matchCount = picksPerMatch.get(pick.fixtureId) || 0
        if (matchCount < maxPicksPerMatch) {
          topPicks.push(pick)
          picksPerMatch.set(pick.fixtureId, matchCount + 1)
        }
      }

      // Log diversification stats
      const uniqueMatches = picksPerMatch.size
      this.logger.log(
        `Selected ${topPicks.length} picks from ${uniqueMatches} different matches (max ${maxPicksPerMatch} per match)`
      )

      // Also filter and sort pickDocuments to match
      const qualifiedPickDocs = pickDocuments.filter(
        (doc) => (doc.probOwn || 0) >= minProbability
      )

      const sortedPickDocs = [...qualifiedPickDocs].sort((a, b) => {
        return (b.probOwn || 0) - (a.probOwn || 0)
      })

      // Apply same diversification to pickDocuments
      const topPickDocs: typeof sortedPickDocs = []
      const docsPerMatch = new Map<number, number>()

      for (const doc of sortedPickDocs) {
        if (topPickDocs.length >= maxPicks) break

        const fixtureId = doc.fixtureId || 0
        const matchCount = docsPerMatch.get(fixtureId) || 0
        if (matchCount < maxPicksPerMatch) {
          topPickDocs.push(doc)
          docsPerMatch.set(fixtureId, matchCount + 1)
        }
      }

      // Log final selection summary
      const marketBreakdown = topPicks.reduce((acc, p) => {
        acc[p.market] = (acc[p.market] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      this.logger.log(
        `Final selection: ${topPicks.length} picks - ${JSON.stringify(marketBreakdown)}`
      )

      // Generate combos from TOP picks only (so all combos reference saved picks)
      const rawCombos = this.comboEngineService.runComboEngine(
        topPicks,
        contexts
      )

      this.logger.log(`Generated ${rawCombos.length} raw combo candidates from top ${topPicks.length} picks`)

      // ================================================
      // ANTI-PATTERN VALIDATION (Phase 4)
      // ================================================
      // Validate combos against anti-patterns before portfolio optimization
      // This filters out combos with critical issues and adjusts scores for warnings
      const dailySummary: DailyPicksSummary = this.antiPatternService.createEmptyDailySummary()
      const allCombos = []

      for (const combo of rawCombos) {
        // Build team contexts map from combo legs
        const teamContexts = new Map()
        for (const leg of combo.legs) {
          // Create basic team context from leg stats
          if (leg.teamAStats || leg.teamBStats) {
            const cornersAvg = leg.teamAStats?.avg_corners_for || 5.0
            teamContexts.set(leg.fixtureId, {
              teamId: leg.fixtureId, // Use fixtureId as proxy
              isChampion: false,
              isRelegated: false,
              coachChangedRecently: false,
              gamesAfterCoachChange: 10, // Assume enough games
              cornersStdDev: cornersAvg * 0.4, // Estimate std dev as 40% of avg
              cornersAvg,
              probFavorite: 0.5, // Default
              remainingGames: 10,
            })
          }
        }

        // Check anti-patterns
        const warnings = this.antiPatternService.checkAntiPatterns(
          combo,
          teamContexts,
          dailySummary
        )

        // Discard combos with CRITICAL anti-patterns
        if (this.antiPatternService.shouldDiscardCombo(warnings)) {
          this.logger.warn(
            `Combo ${combo.type} discarded: ${warnings.find(w => w.severity === 'CRITICAL')?.pattern}`
          )
          continue
        }

        // Apply score adjustments for non-critical warnings
        const adjustedCombo = warnings.length > 0
          ? this.antiPatternService.applyAntiPatternAdjustments(combo, warnings)
          : combo

        // Update daily summary for concentration tracking
        this.antiPatternService.updateDailySummary(dailySummary, adjustedCombo)

        allCombos.push(adjustedCombo)
      }

      this.logger.log(
        `Anti-pattern validation: ${rawCombos.length} → ${allCombos.length} combos ` +
        `(${rawCombos.length - allCombos.length} discarded)`
      )

      // Optimize portfolio
      const maxCombos = settings.stakes?.maxCombosPerDay || 3
      const optimizedPortfolio = this.portfolioOptimizerService.optimizePortfolio(
        allCombos,
        settings.bankroll
      )

      // Limit combos to maxCombosPerDay
      optimizedPortfolio.selectedCombos = optimizedPortfolio.selectedCombos.slice(0, maxCombos)

      this.logger.log(
        `Portfolio optimized: ${optimizedPortfolio.selectedCombos.length} combos selected`
      )

      // Delete existing picks and combos for this date (avoid duplicates from multiple runs)
      const deleteResult = await this.bettingPickModel.deleteMany({
        date: new Date(tomorrowDate),
      })
      const deleteComboResult = await this.bettingComboModel.deleteMany({
        date: new Date(tomorrowDate),
      })
      if (deleteResult.deletedCount > 0 || deleteComboResult.deletedCount > 0) {
        this.logger.log(
          `Cleaned up previous run: ${deleteResult.deletedCount} picks, ${deleteComboResult.deletedCount} combos`
        )
      }

      // Calculate stakes for individual picks
      for (const pickDoc of topPickDocs) {
        const stake = this.stakeCalculatorService.calculatePickStake(
          pickDoc.probOwn || 0,
          pickDoc.oddsAtDetection || 1,
          pickDoc.edge || 0,
          settings.bankroll
        )
        pickDoc.stake = stake
      }

      // Save only top picks to database (max 5)
      const savedPicksMap = new Map<string, string>()
      const savedPickResults = await this.bettingPickModel.insertMany(topPickDocs)
      savedPickResults.forEach((pick: any, idx: number) => {
        const key = `${topPickDocs[idx].fixtureId}-${topPickDocs[idx].market}-${topPickDocs[idx].direction}`
        savedPicksMap.set(key, pick._id.toString())
      })
      this.logger.log(`Saved ${savedPickResults.length} picks to database`)

      // Build combo documents, but filter out combos where any leg has no saved pickId
      const comboDocuments = optimizedPortfolio.selectedCombos
        .map((combo) => {
          const stakeResult = this.stakeCalculatorService.calculateStake(combo, {
            totalBankroll: settings.bankroll,
          })

          const legs = combo.legs.map((leg) => {
            const pickKey = `${leg.fixtureId}-${leg.market}-${leg.direction}`
            const pickId = savedPicksMap.get(pickKey)
            return {
              pickId: pickId ? new Types.ObjectId(pickId) : null,
              fixtureId: leg.fixtureId,
              leagueId: leg.leagueId || 0,
              homeTeam: leg.homeTeam || 'TBD',
              awayTeam: leg.awayTeam || 'TBD',
              market: leg.market,
              direction: leg.direction,
              line: leg.line,
              odds: leg.odds,
              probOwn: leg.probOwn,
              confidenceScore: Math.min(100, Math.round((leg.edge || 0.05) * 500 + 40)),
            }
          })

          // Check if all legs have valid pickIds
          const allLegsValid = legs.every((leg) => leg.pickId !== null)
          if (!allLegsValid) {
            return null // This combo references picks not in our saved top picks
          }

          return {
            date: new Date(tomorrowDate),
            type: combo.type,
            legs,
            combinedOdds: combo.combinedOdds,
            pCasa: combo.pCasa,
            pReal: combo.pJoint,
            evReal: combo.evReal,
            hiddenEdge: combo.hiddenEdge,
            correlation: {
              base: combo.correlation?.base || 0,
              dynamic: combo.correlation?.dynamic || 0,
              adjustments: combo.correlation?.adjustments || [],
            },
            score: combo.score,
            sharpConfirmed: combo.sharpConfirmed,
            timeWindow: combo.timeWindow,
            stake: stakeResult.recommendedStake,
            status: ComboStatus.PENDING,
            warnings: combo.warnings || [],
            contextFlags: combo.contextFlags || [],
          }
        })
        .filter((doc) => doc !== null)

      this.logger.log(
        `Combo filtering: ${optimizedPortfolio.selectedCombos.length} candidates → ${comboDocuments.length} valid (all legs have saved picks)`
      )

      // Save combos to database
      let savedComboCount = 0
      if (comboDocuments.length > 0) {
        try {
          await this.bettingComboModel.insertMany(comboDocuments)
          savedComboCount = comboDocuments.length
          this.logger.log(`Saved ${savedComboCount} combos to database`)
        } catch (comboError) {
          this.logger.error(`Failed to save combos: ${comboError}`)
        }
      }

      // Send Telegram Alert 1: Nightly Analysis
      const savedPicks = await this.bettingPickModel
        .find({ date: new Date(tomorrowDate) })
        .exec()
      const savedCombos = await this.bettingComboModel
        .find({ date: new Date(tomorrowDate) })
        .exec()

      this.logger.log(`Sending Telegram alert: ${savedPicks.length} picks, ${savedCombos.length} combos`)

      await this.telegramService.sendNightlyAnalysisAlert(
        new Date(tomorrowDate),
        savedPicks,
        savedCombos,
        fixturesAnalyzed,
        activeLeagues.length
      )

      const duration = Date.now() - startTime
      this.logger.log(
        `Nightly analysis completed in ${duration}ms: ` +
          `${topPickDocs.length} picks, ${comboDocuments.length} combos`
      )
    } catch (error) {
      this.logger.error(`Nightly analysis failed: ${error}`)
    }
  }

  /**
   * Analyze a single league for value picks
   * Returns picks and number of fixtures analyzed
   */
  private async analyzeLeague(
    league: BettingLeagueDocument,
    date: string,
    contexts: Map<number, any>,
    bankroll: number
  ): Promise<{ picks: Array<{ leg: ComboLeg; document: Partial<BettingPick> }>; fixturesCount: number }> {
    const picks: Array<{ leg: ComboLeg; document: Partial<BettingPick> }> = []
    let fixturesCount = 0

    try {
      // Get fixtures for this league
      const fixtures = await this.apiFootballService.getFixtures(
        date,
        league.apiFootballId,
        league.season || '2025'
      )

      if (!fixtures || fixtures.length === 0) {
        this.logger.debug(`No fixtures found for ${league.name} on ${date}`)
        return { picks, fixturesCount: 0 }
      }

      fixturesCount = fixtures.length
      this.logger.log(`Found ${fixtures.length} fixtures for ${league.name}`)

      for (const fixture of fixtures) {
        this.logger.debug(`Analyzing: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`)

        // Get team stats
        const [teamAStats, teamBStats, h2h] = await Promise.all([
          this.apiFootballService.getTeamStats(
            league.apiFootballId,
            fixture.homeTeamId
          ),
          this.apiFootballService.getTeamStats(
            league.apiFootballId,
            fixture.awayTeamId
          ),
          this.apiFootballService.getH2H(fixture.homeTeamId, fixture.awayTeamId),
        ])

        if (!teamAStats || !teamBStats) {
          this.logger.debug(`Missing team stats for ${fixture.homeTeamName} vs ${fixture.awayTeamName}`)
          continue
        }

        this.logger.debug(`Team stats OK for ${fixture.homeTeamName} vs ${fixture.awayTeamName}`)

        // Fetch weather data for the match
        let weather: WeatherData | null = null
        try {
          const kickoffDate = new Date(fixture.kickoff)
          const dateStr = kickoffDate.toISOString().split('T')[0]
          const hour = kickoffDate.getHours()

          // Try stadium first, then city
          weather = await this.openMeteoService.getWeatherForStadium(
            fixture.venue,
            dateStr,
            hour
          )

          if (!weather && fixture.city) {
            weather = await this.openMeteoService.getWeatherForCity(
              fixture.city,
              dateStr,
              hour
            )
          }

          if (weather) {
            this.logger.debug(
              `Weather for ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ` +
              `${weather.weatherDescription}, ${weather.temperature}°C, wind ${weather.windSpeed}km/h`
            )
          }
        } catch (weatherError) {
          this.logger.warn(`Failed to fetch weather for fixture ${fixture.fixtureId}: ${weatherError}`)
        }

        // Get match context with weather data
        const context = this.contextService.getMatchContext(
          fixture,
          teamAStats,
          teamBStats,
          weather
        )
        contexts.set(fixture.fixtureId, context)

        // Get odds
        const odds = await this.apiFootballService.getOdds(fixture.fixtureId)

        this.logger.debug(
          `Odds for ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ${odds ? 'available' : 'NOT AVAILABLE'}`
        )

        // Score goals 1H
        const goalsResult = this.scoringGoalsService.scoreGoals1H(
          fixture,
          teamAStats,
          teamBStats,
          h2h,
          league.tier as 1 | 2 | 3 | 4
        )

        this.logger.debug(
          `Goals scoring: probOver05_1H=${(goalsResult.probOver05_1H * 100).toFixed(1)}%, ` +
            `probOver15_1H=${(goalsResult.probOver15_1H * 100).toFixed(1)}%`
        )

        // Score corners
        const cornersResult = this.scoringCornersService.scoreCorners(
          fixture,
          teamAStats,
          teamBStats,
          h2h,
          league.apiFootballId
        )

        // Detect value for Over 0.5 1H
        if (goalsResult.probOver05_1H > 0 && odds) {
          const over05Odds = this.findOddsForMarket(odds, 'over_05_1h')
          this.logger.debug(`Over 0.5 1H odds: ${over05Odds}`)

          if (over05Odds > 1.0) {
            const valueResult = this.valueDetectionService.detectValueGoals(
              goalsResult,
              'over_05_1h',
              over05Odds,
              'API-Football'
            )

            this.logger.debug(
              `Value detection Over 0.5 1H: hasValue=${valueResult.hasValue}, edge=${(valueResult.edge * 100).toFixed(1)}%`
            )

            if (valueResult.hasValue) {
              const timeWindow = this.determineTimeWindow(
                new Date(fixture.kickoff)
              )

              picks.push({
                leg: {
                  fixtureId: fixture.fixtureId,
                  leagueId: league.apiFootballId,
                  homeTeam: fixture.homeTeamName,
                  awayTeam: fixture.awayTeamName,
                  market: MarketType.OVER_05_1H,
                  direction: 'OVER',
                  line: 0.5,
                  odds: over05Odds,
                  probOwn: goalsResult.probOver05_1H,
                  edge: valueResult.edge,
                  confidenceScore: Math.min(100, Math.round(valueResult.edge * 500 + 40)),
                  teamAStats,
                  teamBStats,
                },
                document: {
                  fixtureId: fixture.fixtureId,
                  date: new Date(date),
                  league: {
                    id: league.apiFootballId,
                    name: league.name,
                    country: league.country,
                    tier: league.tier,
                  },
                  teamHome: {
                    id: fixture.homeTeamId,
                    name: fixture.homeTeamName,
                  },
                  teamAway: {
                    id: fixture.awayTeamId,
                    name: fixture.awayTeamName,
                  },
                  kickoff: new Date(fixture.kickoff),
                  timeWindow,
                  market: MarketType.OVER_05_1H,
                  direction: MarketDirection.OVER,
                  line: 0.5,
                  probOwn: goalsResult.probOver05_1H,
                  probImplied: valueResult.probImplied,
                  edge: valueResult.edge,
                  confidenceScore: Math.min(100, Math.round(valueResult.edge * 500 + 40)),
                  oddsAtDetection: over05Odds,
                  bestBookmaker: 'API-Football',
                  status: PickStatus.PENDING,
                  stars: this.calculateStars(valueResult.edge),
                  reasons: this.generateGoalsReasons(
                    'over_05_1h',
                    teamAStats,
                    teamBStats,
                    h2h,
                    league,
                    goalsResult
                  ),
                  modelInputs: {
                    dataSource: 'API-Football',
                    contextFlags: context.flags,
                    expectedGoals1H: goalsResult.expectedGoals1H,
                    teamAStats: {
                      name: fixture.homeTeamName,
                      avgGoals1H: teamAStats.avg_goals_1h,
                      avgConceded1H: teamAStats.avg_conceded_1h,
                      over05_1h_pct: teamAStats.over05_1h_pct,
                      gamesPlayed: teamAStats.gamesPlayed,
                      dataQuality: teamAStats.dataQuality?.form_goals_1h || 'estimated',
                    },
                    teamBStats: {
                      name: fixture.awayTeamName,
                      avgGoals1H: teamBStats.avg_goals_1h,
                      avgConceded1H: teamBStats.avg_conceded_1h,
                      over05_1h_pct: teamBStats.over05_1h_pct,
                      gamesPlayed: teamBStats.gamesPlayed,
                      dataQuality: teamBStats.dataQuality?.form_goals_1h || 'estimated',
                    },
                    calculationExplanation: `Probabilidad calculada usando stats de ${teamAStats.gamesPlayed} partidos del local y ${teamBStats.gamesPlayed} del visitante. xG 1H: ${goalsResult.expectedGoals1H?.toFixed(2) || 'N/A'}.`,
                    ...this.getWeatherFields(weather, context),
                  },
                },
              })
            }
          }
        }

        // Detect value for Over 1.5 1H (higher risk, higher reward)
        if (goalsResult.probOver15_1H > 0 && odds) {
          const over15Odds = this.findOddsForMarket(odds, 'over_15_1h')
          if (over15Odds > 1.0) {
            const valueResult = this.valueDetectionService.detectValueGoals(
              goalsResult,
              'over_15_1h',
              over15Odds,
              'API-Football'
            )

            if (valueResult.hasValue) {
              const timeWindow = this.determineTimeWindow(
                new Date(fixture.kickoff)
              )

              picks.push({
                leg: {
                  fixtureId: fixture.fixtureId,
                  leagueId: league.apiFootballId,
                  homeTeam: fixture.homeTeamName,
                  awayTeam: fixture.awayTeamName,
                  market: MarketType.OVER_15_1H,
                  direction: 'OVER',
                  line: 1.5,
                  odds: over15Odds,
                  probOwn: goalsResult.probOver15_1H,
                  edge: valueResult.edge,
                  confidenceScore: Math.min(100, Math.round(valueResult.edge * 500 + 40)),
                  teamAStats,
                  teamBStats,
                },
                document: {
                  fixtureId: fixture.fixtureId,
                  date: new Date(date),
                  league: {
                    id: league.apiFootballId,
                    name: league.name,
                    country: league.country,
                    tier: league.tier,
                  },
                  teamHome: {
                    id: fixture.homeTeamId,
                    name: fixture.homeTeamName,
                  },
                  teamAway: {
                    id: fixture.awayTeamId,
                    name: fixture.awayTeamName,
                  },
                  kickoff: new Date(fixture.kickoff),
                  timeWindow,
                  market: MarketType.OVER_15_1H,
                  direction: MarketDirection.OVER,
                  line: 1.5,
                  probOwn: goalsResult.probOver15_1H,
                  probImplied: valueResult.probImplied,
                  edge: valueResult.edge,
                  confidenceScore: Math.min(100, Math.round(valueResult.edge * 500 + 40)),
                  oddsAtDetection: over15Odds,
                  bestBookmaker: 'API-Football',
                  status: PickStatus.PENDING,
                  stars: this.calculateStars(valueResult.edge),
                  reasons: this.generateGoalsReasons(
                    'over_15_1h',
                    teamAStats,
                    teamBStats,
                    h2h,
                    league,
                    goalsResult
                  ),
                  modelInputs: {
                    dataSource: 'API-Football',
                    contextFlags: context.flags,
                    expectedGoals1H: goalsResult.expectedGoals1H,
                    teamAStats: {
                      name: fixture.homeTeamName,
                      avgGoals1H: teamAStats.avg_goals_1h,
                      avgConceded1H: teamAStats.avg_conceded_1h,
                      over05_1h_pct: teamAStats.over05_1h_pct,
                      gamesPlayed: teamAStats.gamesPlayed,
                      dataQuality: teamAStats.dataQuality?.form_goals_1h || 'estimated',
                    },
                    teamBStats: {
                      name: fixture.awayTeamName,
                      avgGoals1H: teamBStats.avg_goals_1h,
                      avgConceded1H: teamBStats.avg_conceded_1h,
                      over05_1h_pct: teamBStats.over05_1h_pct,
                      gamesPlayed: teamBStats.gamesPlayed,
                      dataQuality: teamBStats.dataQuality?.form_goals_1h || 'estimated',
                    },
                    calculationExplanation: `Over 1.5 1H requiere que ambos equipos marquen. Local promedia ${teamAStats.avg_goals_1h?.toFixed(2)} goles/1H, visitante ${teamBStats.avg_goals_1h?.toFixed(2)}. xG combinado: ${goalsResult.expectedGoals1H?.toFixed(2) || 'N/A'}.`,
                    ...this.getWeatherFields(weather, context),
                  },
                },
              })
            }
          }
        }

        // Detect value for corners (multiple lines: 8.5, 9.5, 10.5, 11.5)
        if (cornersResult.cornersExpected > 0 && odds) {
          const cornerLines = [8.5, 9.5, 10.5, 11.5]
          const timeWindow = this.determineTimeWindow(new Date(fixture.kickoff))

          for (const line of cornerLines) {
            const cornersOdds = this.findCornersOdds(odds, line)

            if (cornersOdds) {
              const valueResult = this.valueDetectionService.detectValueCorners(
                cornersResult,
                line,
                cornersOdds.over,
                cornersOdds.under,
                'API-Football'
              )

              if (valueResult.hasValue) {
                const market = this.getCornersMarketType(
                  line,
                  valueResult.direction
                )

                picks.push({
                  leg: {
                    fixtureId: fixture.fixtureId,
                    leagueId: league.apiFootballId,
                    homeTeam: fixture.homeTeamName,
                    awayTeam: fixture.awayTeamName,
                    market,
                    direction: valueResult.direction,
                    line,
                    odds: valueResult.bestOdds,
                    probOwn: valueResult.probOwn,
                    edge: valueResult.edge,
                    confidenceScore: Math.min(100, Math.round(valueResult.edge * 500 + 40)),
                    teamAStats,
                    teamBStats,
                  },
                  document: {
                    fixtureId: fixture.fixtureId,
                    date: new Date(date),
                    league: {
                      id: league.apiFootballId,
                      name: league.name,
                      country: league.country,
                      tier: league.tier,
                    },
                    teamHome: {
                      id: fixture.homeTeamId,
                      name: fixture.homeTeamName,
                    },
                    teamAway: {
                      id: fixture.awayTeamId,
                      name: fixture.awayTeamName,
                    },
                    kickoff: new Date(fixture.kickoff),
                    timeWindow,
                    market,
                    direction:
                      valueResult.direction === 'OVER'
                        ? MarketDirection.OVER
                        : MarketDirection.UNDER,
                    line,
                    probOwn: valueResult.probOwn,
                    probImplied: valueResult.probImplied,
                    edge: valueResult.edge,
                    confidenceScore: Math.min(100, Math.round(valueResult.edge * 500 + 40)),
                    oddsAtDetection: valueResult.bestOdds,
                    bestBookmaker: 'API-Football',
                    status: PickStatus.PENDING,
                    stars: this.calculateStars(valueResult.edge),
                    reasons: this.generateCornersReasons(
                      `corners_${line}`,
                      teamAStats,
                      teamBStats,
                      h2h,
                      league,
                      cornersResult
                    ),
                    modelInputs: {
                      dataSource: 'API-Football',
                      contextFlags: context.flags,
                      cornersExpected: cornersResult.cornersExpected,
                      teamAStats: {
                        name: fixture.homeTeamName,
                        cornersForAvg: teamAStats.avg_corners_for,
                        cornersAgainstAvg: teamAStats.avg_corners_against,
                        gamesPlayed: teamAStats.gamesPlayed,
                        dataQuality: teamAStats.dataQuality?.corners || 'league_average',
                      },
                      teamBStats: {
                        name: fixture.awayTeamName,
                        cornersForAvg: teamBStats.avg_corners_for,
                        cornersAgainstAvg: teamBStats.avg_corners_against,
                        gamesPlayed: teamBStats.gamesPlayed,
                        dataQuality: teamBStats.dataQuality?.corners || 'league_average',
                      },
                      calculationExplanation: `Corners esperados (${cornersResult.cornersExpected?.toFixed(1)}) calculados sumando: Local gana ${teamAStats.avg_corners_for?.toFixed(1)} + Visitante gana ${teamBStats.avg_corners_for?.toFixed(1)} corners/partido.`,
                      ...this.getWeatherFields(weather, context),
                    },
                  },
                })
              }
            }
          }

          // Also detect corners first half (4.5 line)
          const corners1HOdds = this.findCornersOdds(odds, 4.5, true)
          if (corners1HOdds) {
            const probs1H = cornersResult.prob1HByLine.get(4.5)
            if (probs1H) {
              const probImpliedOver = 1 / corners1HOdds.over
              const probImpliedUnder = 1 / corners1HOdds.under
              const edgeOver = probs1H.over - probImpliedOver
              const edgeUnder = probs1H.under - probImpliedUnder

              // Choose the direction with higher edge
              const bestDirection = edgeOver > edgeUnder ? 'OVER' : 'UNDER'
              const bestEdge = Math.max(edgeOver, edgeUnder)
              const bestOdds =
                bestDirection === 'OVER'
                  ? corners1HOdds.over
                  : corners1HOdds.under
              const bestProb =
                bestDirection === 'OVER' ? probs1H.over : probs1H.under

              if (bestEdge >= 0.05) {
                picks.push({
                  leg: {
                    fixtureId: fixture.fixtureId,
                    leagueId: league.apiFootballId,
                    homeTeam: fixture.homeTeamName,
                    awayTeam: fixture.awayTeamName,
                    market: MarketType.OVER_45_CORNERS_1H,
                    direction: bestDirection,
                    line: 4.5,
                    odds: bestOdds,
                    probOwn: bestProb,
                    edge: bestEdge,
                    confidenceScore: Math.min(100, Math.round(bestEdge * 500 + 40)),
                    teamAStats,
                    teamBStats,
                  },
                  document: {
                    fixtureId: fixture.fixtureId,
                    date: new Date(date),
                    league: {
                      id: league.apiFootballId,
                      name: league.name,
                      country: league.country,
                      tier: league.tier,
                    },
                    teamHome: {
                      id: fixture.homeTeamId,
                      name: fixture.homeTeamName,
                    },
                    teamAway: {
                      id: fixture.awayTeamId,
                      name: fixture.awayTeamName,
                    },
                    kickoff: new Date(fixture.kickoff),
                    timeWindow,
                    market: MarketType.OVER_45_CORNERS_1H,
                    direction:
                      bestDirection === 'OVER'
                        ? MarketDirection.OVER
                        : MarketDirection.UNDER,
                    line: 4.5,
                    probOwn: bestProb,
                    probImplied:
                      bestDirection === 'OVER'
                        ? probImpliedOver
                        : probImpliedUnder,
                    edge: bestEdge,
                    confidenceScore: Math.min(100, Math.round(bestEdge * 500 + 40)),
                    oddsAtDetection: bestOdds,
                    bestBookmaker: 'API-Football',
                    status: PickStatus.PENDING,
                    stars: this.calculateStars(bestEdge),
                    reasons: this.generateCornersReasons(
                      'corners_1h_4.5',
                      teamAStats,
                      teamBStats,
                      h2h,
                      league,
                      cornersResult
                    ),
                    modelInputs: {
                      dataSource: 'API-Football',
                      contextFlags: context.flags,
                      cornersExpected1H: cornersResult.cornersExpected1H,
                      cornersExpected: cornersResult.cornersExpected,
                      teamAStats: {
                        name: fixture.homeTeamName,
                        cornersForAvg: teamAStats.avg_corners_for,
                        cornersAgainstAvg: teamAStats.avg_corners_against,
                        gamesPlayed: teamAStats.gamesPlayed,
                        dataQuality: teamAStats.dataQuality?.corners || 'league_average',
                      },
                      teamBStats: {
                        name: fixture.awayTeamName,
                        cornersForAvg: teamBStats.avg_corners_for,
                        cornersAgainstAvg: teamBStats.avg_corners_against,
                        gamesPlayed: teamBStats.gamesPlayed,
                        dataQuality: teamBStats.dataQuality?.corners || 'league_average',
                      },
                      calculationExplanation: `Corners 1H esperados: ${cornersResult.cornersExpected1H?.toFixed(1)} (aprox 45% del total ${cornersResult.cornersExpected?.toFixed(1)}). Basado en promedios de ${teamAStats.gamesPlayed} y ${teamBStats.gamesPlayed} partidos.`,
                      ...this.getWeatherFields(weather, context),
                    },
                  },
                })
              }
            }
          }

          // Detect Asian Corners Handicap value
          const handicapOdds = this.findCornersHandicapOdds(odds)
          if (handicapOdds) {
            const handicapValue =
              this.valueDetectionService.detectValueCornersHandicap(
                cornersResult,
                handicapOdds.line,
                handicapOdds.home,
                handicapOdds.away,
                'API-Football'
              )

            if (handicapValue.hasValue) {
              picks.push({
                leg: {
                  fixtureId: fixture.fixtureId,
                  leagueId: league.apiFootballId,
                  homeTeam: fixture.homeTeamName,
                  awayTeam: fixture.awayTeamName,
                  market: MarketType.CORNERS_HANDICAP,
                  direction: handicapValue.direction,
                  line: handicapOdds.line,
                  odds: handicapValue.bestOdds,
                  probOwn: handicapValue.probOwn,
                  edge: handicapValue.edge,
                  confidenceScore: Math.min(100, Math.round(handicapValue.edge * 500 + 40)),
                  teamAStats,
                  teamBStats,
                },
                document: {
                  fixtureId: fixture.fixtureId,
                  date: new Date(date),
                  league: {
                    id: league.apiFootballId,
                    name: league.name,
                    country: league.country,
                    tier: league.tier,
                  },
                  teamHome: {
                    id: fixture.homeTeamId,
                    name: fixture.homeTeamName,
                  },
                  teamAway: {
                    id: fixture.awayTeamId,
                    name: fixture.awayTeamName,
                  },
                  kickoff: new Date(fixture.kickoff),
                  timeWindow,
                  market: MarketType.CORNERS_HANDICAP,
                  direction:
                    handicapValue.direction === 'OVER'
                      ? MarketDirection.OVER
                      : MarketDirection.UNDER,
                  line: handicapOdds.line,
                  probOwn: handicapValue.probOwn,
                  probImplied: handicapValue.probImplied,
                  edge: handicapValue.edge,
                  confidenceScore: Math.min(100, Math.round(handicapValue.edge * 500 + 40)),
                  oddsAtDetection: handicapValue.bestOdds,
                  bestBookmaker: 'API-Football',
                  status: PickStatus.PENDING,
                  stars: this.calculateStars(handicapValue.edge),
                  reasons: this.generateHandicapReasons(
                    fixture.homeTeamName,
                    fixture.awayTeamName,
                    cornersResult.handicapLine,
                    handicapOdds.line,
                    handicapValue.direction,
                    handicapValue.edge,
                    handicapValue.probOwn,
                    teamAStats,
                    teamBStats
                  ),
                  modelInputs: {
                    dataSource: 'API-Football',
                    contextFlags: context.flags,
                    cornersExpected: cornersResult.cornersExpected,
                    handicapLineExpected: cornersResult.handicapLine,
                    handicapLineBookmaker: handicapOdds.line,
                    teamAStats: {
                      name: fixture.homeTeamName,
                      cornersForAvg: teamAStats.avg_corners_for,
                      cornersAgainstAvg: teamAStats.avg_corners_against,
                      gamesPlayed: teamAStats.gamesPlayed,
                      dataQuality: teamAStats.dataQuality?.corners || 'league_average',
                    },
                    teamBStats: {
                      name: fixture.awayTeamName,
                      cornersForAvg: teamBStats.avg_corners_for,
                      cornersAgainstAvg: teamBStats.avg_corners_against,
                      gamesPlayed: teamBStats.gamesPlayed,
                      dataQuality: teamBStats.dataQuality?.corners || 'league_average',
                    },
                    calculationExplanation: `Handicap modelo: ${cornersResult.handicapLine >= 0 ? '+' : ''}${cornersResult.handicapLine?.toFixed(1)} (${fixture.homeTeamName} ${teamAStats.avg_corners_for?.toFixed(1)} - ${fixture.awayTeamName} ${teamBStats.avg_corners_for?.toFixed(1)} = diferencia esperada). Casa ofrece ${handicapOdds.line >= 0 ? '+' : ''}${handicapOdds.line}. Discrepancia de ${Math.abs(cornersResult.handicapLine - handicapOdds.line).toFixed(1)} corners = valor.`,
                    ...this.getWeatherFields(weather, context),
                  },
                },
              })
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to analyze league ${league.name}: ${error}`)
    }

    return { picks, fixturesCount }
  }

  /**
   * Find odds for a specific market from API-Football response
   * UPDATED: Added logging for debugging
   */
  private findOddsForMarket(
    odds: any,
    marketName: string
  ): number {
    if (!odds?.bookmakers) {
      this.logger.debug(`No bookmakers found in odds response`)
      return 0
    }

    // Determine which line we're looking for
    const isOver05 = marketName === 'over_05_1h'
    const isOver15 = marketName === 'over_15_1h'
    const targetLine = isOver05 ? '0.5' : isOver15 ? '1.5' : '0.5'

    // First, try exact match on "Goals Over/Under First Half" market
    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        const marketNameLower = market.marketName.toLowerCase()

        // Match "Goals Over/Under First Half" specifically
        if (
          (marketNameLower.includes('goals') && marketNameLower.includes('first half')) ||
          (marketNameLower.includes('goals') && marketNameLower.includes('1st half')) ||
          (marketNameLower === 'goals over/under first half')
        ) {
          for (const value of market.values) {
            const valueName = String(value.name).toLowerCase()
            if (valueName.includes('over') && valueName.includes(targetLine)) {
              this.logger.debug(
                `Found ${marketName}: "${market.marketName}" -> "${value.name}" @${value.odds}`
              )
              return value.odds
            }
          }
        }
      }
    }

    // Fallback: Try broader matching (original logic)
    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        if (
          market.marketName.toLowerCase().includes('goals') &&
          market.marketName.toLowerCase().includes('half')
        ) {
          for (const value of market.values) {
            const valueName = String(value.name).toLowerCase()
            if (valueName.includes('over') && valueName.includes(targetLine)) {
              this.logger.debug(
                `Found ${marketName} (fallback): "${market.marketName}" -> "${value.name}" @${value.odds}`
              )
              return value.odds
            }
          }
        }
      }
    }

    // Log available markets for debugging
    const availableMarkets = odds.bookmakers
      .flatMap((b: any) => b.markets || [])
      .map((m: any) => m.marketName)
      .filter((name: string, idx: number, arr: string[]) => arr.indexOf(name) === idx)
      .filter((name: string) =>
        name.toLowerCase().includes('goal') || name.toLowerCase().includes('half')
      )

    this.logger.warn(
      `${marketName} NOT FOUND. Available goal/half markets: ${availableMarkets.join(', ')}`
    )

    return 0
  }

  /**
   * Find corners odds for a specific line
   */
  private findCornersOdds(
    odds: any,
    line: number,
    isFirstHalf = false
  ): { over: number; under: number } | null {
    if (!odds?.bookmakers) return null

    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        const marketName = market.marketName.toLowerCase()
        const isCornerMarket = marketName.includes('corner')
        const is1HMarket = marketName.includes('half') || marketName.includes('1h')

        // Match the right market type
        if (isCornerMarket && (isFirstHalf ? is1HMarket : !is1HMarket)) {
          let overOdds = 0
          let underOdds = 0

          for (const value of market.values) {
            const linePart = value.name.match(/[\d.]+/)
            if (linePart && parseFloat(linePart[0]) === line) {
              if (value.name.toLowerCase().includes('over')) {
                overOdds = value.odds
              } else if (value.name.toLowerCase().includes('under')) {
                underOdds = value.odds
              }
            }
          }

          if (overOdds > 0 && underOdds > 0) {
            return { over: overOdds, under: underOdds }
          }
        }
      }
    }

    return null
  }

  /**
   * Find Asian Corners Handicap odds from API-Football response
   */
  private findCornersHandicapOdds(
    odds: any
  ): { line: number; home: number; away: number } | null {
    if (!odds?.bookmakers) return null

    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        const marketName = market.marketName.toLowerCase()

        // Look for corners handicap market
        if (
          marketName.includes('corner') &&
          (marketName.includes('handicap') || marketName.includes('asian'))
        ) {
          let homeOdds = 0
          let awayOdds = 0
          let handicapLine = 0

          for (const value of market.values) {
            const linePart = value.name.match(/-?[\d.]+/)
            if (linePart) {
              handicapLine = parseFloat(linePart[0])

              if (
                value.name.toLowerCase().includes('home') ||
                value.name.includes('1')
              ) {
                homeOdds = value.odds
              } else if (
                value.name.toLowerCase().includes('away') ||
                value.name.includes('2')
              ) {
                awayOdds = value.odds
              }
            }
          }

          if (homeOdds > 0 && awayOdds > 0) {
            return { line: handicapLine, home: homeOdds, away: awayOdds }
          }
        }
      }
    }

    return null
  }

  /**
   * Get the appropriate MarketType for corners based on line and direction
   */
  private getCornersMarketType(
    line: number,
    direction: 'OVER' | 'UNDER'
  ): MarketType {
    if (direction === 'OVER') {
      switch (line) {
        case 7.5:
          return MarketType.OVER_75_CORNERS
        case 8.5:
          return MarketType.OVER_85_CORNERS
        case 9.5:
          return MarketType.OVER_95_CORNERS
        case 10.5:
          return MarketType.OVER_105_CORNERS
        case 11.5:
          return MarketType.OVER_115_CORNERS
        case 12.5:
          return MarketType.OVER_125_CORNERS
        default:
          return MarketType.OVER_95_CORNERS
      }
    } else {
      switch (line) {
        case 7.5:
          return MarketType.UNDER_75_CORNERS
        case 8.5:
          return MarketType.UNDER_85_CORNERS
        case 9.5:
          return MarketType.UNDER_95_CORNERS
        case 10.5:
          return MarketType.UNDER_105_CORNERS
        default:
          return MarketType.UNDER_95_CORNERS
      }
    }
  }

  /**
   * Determine time window based on kickoff time
   */
  private determineTimeWindow(kickoff: Date): TimeWindow {
    const hour = kickoff.getHours()

    // Window A: 7-9 AM El Salvador
    if (hour >= 7 && hour < 9) {
      return TimeWindow.WINDOW_A
    }
    // Window B: 9 AM - 1 PM El Salvador
    if (hour >= 9 && hour < 13) {
      return TimeWindow.WINDOW_B
    }
    // Window C: Sunday or late games
    return TimeWindow.WINDOW_C
  }

  /**
   * Get tomorrow's date string in El Salvador timezone
   */
  private getTomorrowDateString(): string {
    // Get current date in El Salvador timezone
    const now = new Date()
    const elSalvadorTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'America/El_Salvador' })
    )
    // Add 1 day
    elSalvadorTime.setDate(elSalvadorTime.getDate() + 1)
    // Format as YYYY-MM-DD
    const year = elSalvadorTime.getFullYear()
    const month = String(elSalvadorTime.getMonth() + 1).padStart(2, '0')
    const day = String(elSalvadorTime.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * Manual trigger for testing
   * @param testDate Optional date override for testing (YYYY-MM-DD format)
   */
  async triggerManualAnalysis(testDate?: string): Promise<{
    picks: number
    combos: number
    leagues: number
  }> {
    this.logger.log(`Manual nightly analysis triggered${testDate ? ` for date: ${testDate}` : ''}`)

    // If testDate provided, temporarily override getTomorrowDateString
    if (testDate) {
      const originalMethod = this.getTomorrowDateString.bind(this)
      this.getTomorrowDateString = () => testDate
      await this.runNightlyAnalysis('Manual')
      this.getTomorrowDateString = originalMethod
    } else {
      await this.runNightlyAnalysis('Manual')
    }

    // Count picks for the specific target date only
    const targetDate = testDate || this.getTomorrowDateString()
    const picks = await this.bettingPickModel.countDocuments({
      date: new Date(targetDate),
    })
    const combos = await this.bettingComboModel.countDocuments({
      date: new Date(targetDate),
    })
    const leagues = await this.bettingLeagueModel.countDocuments({
      isActive: true,
    })

    return { picks, combos, leagues }
  }
}
