import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
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
import { ComboEngineService, ComboLeg } from '../services/combo-engine.service'
import { PortfolioOptimizerService } from '../services/portfolio-optimizer.service'
import { StakeCalculatorService } from '../services/stake-calculator.service'
import { BettingTelegramService } from '../telegram/betting-telegram.service'
import {
  PickStatus,
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
    private telegramService: BettingTelegramService
  ) {}

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
        const leaguePicks = await this.analyzeLeague(
          league,
          tomorrowDate,
          contexts,
          settings.bankroll
        )

        for (const pick of leaguePicks) {
          allValuePicks.push(pick.leg)
          pickDocuments.push(pick.document)
        }

        fixturesAnalyzed += leaguePicks.length > 0 ? 1 : 0
      }

      this.logger.log(
        `Analysis complete: ${allValuePicks.length} value picks from ${fixturesAnalyzed} fixtures`
      )

      // Generate combos from value picks
      const allCombos = this.comboEngineService.runComboEngine(
        allValuePicks,
        contexts
      )

      this.logger.log(`Generated ${allCombos.length} combo candidates`)

      // Optimize portfolio
      const optimizedPortfolio = this.portfolioOptimizerService.optimizePortfolio(
        allCombos,
        settings.bankroll
      )

      this.logger.log(
        `Portfolio optimized: ${optimizedPortfolio.selectedCombos.length} combos selected`
      )

      // Save picks to database
      if (pickDocuments.length > 0) {
        await this.bettingPickModel.insertMany(pickDocuments)
        this.logger.log(`Saved ${pickDocuments.length} picks to database`)
      }

      // Save combos to database
      const comboDocuments = optimizedPortfolio.selectedCombos.map((combo) => {
        const stakeResult = this.stakeCalculatorService.calculateStake(combo, {
          totalBankroll: settings.bankroll,
        })

        return {
          type: combo.type,
          legs: combo.legs.map((leg) => ({
            fixtureId: leg.fixtureId,
            market: leg.market,
            direction: leg.direction,
            line: leg.line,
            odds: leg.odds,
            probOwn: leg.probOwn,
          })),
          combinedOdds: combo.combinedOdds,
          pJoint: combo.pJoint,
          pCasa: combo.pCasa,
          evReal: combo.evReal,
          hiddenEdge: combo.hiddenEdge,
          correlation: combo.correlation.dynamic,
          score: combo.score,
          scoreLevel: combo.scoreLevel,
          sharpConfirmed: combo.sharpConfirmed,
          timeWindow: combo.timeWindow,
          stake: stakeResult.recommendedStake,
          status: PickStatus.PENDING,
          warnings: combo.warnings,
          contextFlags: combo.contextFlags,
        }
      })

      if (comboDocuments.length > 0) {
        await this.bettingComboModel.insertMany(comboDocuments)
        this.logger.log(`Saved ${comboDocuments.length} combos to database`)
      }

      // Send Telegram Alert 1: Nightly Analysis
      const savedPicks = await this.bettingPickModel
        .find({ date: new Date(tomorrowDate) })
        .exec()
      const savedCombos = await this.bettingComboModel
        .find({ createdAt: { $gte: new Date(tomorrowDate) } })
        .exec()

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
          `${pickDocuments.length} picks, ${comboDocuments.length} combos`
      )
    } catch (error) {
      this.logger.error(`Nightly analysis failed: ${error}`)
    }
  }

  /**
   * Analyze a single league for value picks
   */
  private async analyzeLeague(
    league: BettingLeagueDocument,
    date: string,
    contexts: Map<number, any>,
    bankroll: number
  ): Promise<Array<{ leg: ComboLeg; document: Partial<BettingPick> }>> {
    const picks: Array<{ leg: ComboLeg; document: Partial<BettingPick> }> = []

    try {
      // Get fixtures for this league
      const fixtures = await this.apiFootballService.getFixtures(
        date,
        league.apiFootballId
      )

      if (!fixtures || fixtures.length === 0) {
        return picks
      }

      for (const fixture of fixtures) {
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
          continue
        }

        // Get match context (pass null for weather in nightly analysis)
        const context = this.contextService.getMatchContext(
          fixture,
          teamAStats,
          teamBStats,
          null // Weather not fetched in nightly analysis
        )
        contexts.set(fixture.fixtureId, context)

        // Get odds
        const odds = await this.apiFootballService.getOdds(fixture.fixtureId)

        // Score goals 1H
        const goalsResult = this.scoringGoalsService.scoreGoals1H(
          fixture,
          teamAStats,
          teamBStats,
          h2h,
          league.tier as 1 | 2 | 3 | 4
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
          if (over05Odds > 1.0) {
            const valueResult = this.valueDetectionService.detectValueGoals(
              goalsResult,
              'over_05_1h',
              over05Odds,
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
                  market: MarketType.OVER_05_1H,
                  direction: 'OVER',
                  line: 0.5,
                  odds: over05Odds,
                  probOwn: goalsResult.probOver05_1H,
                  edge: valueResult.edge,
                  confidenceScore: Math.round(valueResult.edge * 1000),
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
                  confidenceScore: Math.round(valueResult.edge * 1000),
                  oddsAtDetection: over05Odds,
                  bestBookmaker: 'API-Football',
                  status: PickStatus.PENDING,
                  modelInputs: {
                    contextFlags: context.flags,
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
                  confidenceScore: Math.round(valueResult.edge * 1000),
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
                  confidenceScore: Math.round(valueResult.edge * 1000),
                  oddsAtDetection: over15Odds,
                  bestBookmaker: 'API-Football',
                  status: PickStatus.PENDING,
                  modelInputs: {
                    contextFlags: context.flags,
                    expectedGoals1H: goalsResult.expectedGoals1H,
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
                    confidenceScore: Math.round(valueResult.edge * 1000),
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
                    confidenceScore: Math.round(valueResult.edge * 1000),
                    oddsAtDetection: valueResult.bestOdds,
                    bestBookmaker: 'API-Football',
                    status: PickStatus.PENDING,
                    modelInputs: {
                      contextFlags: context.flags,
                      cornersExpected: cornersResult.cornersExpected,
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
                    confidenceScore: Math.round(bestEdge * 1000),
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
                    confidenceScore: Math.round(bestEdge * 1000),
                    oddsAtDetection: bestOdds,
                    bestBookmaker: 'API-Football',
                    status: PickStatus.PENDING,
                    modelInputs: {
                      contextFlags: context.flags,
                      cornersExpected1H: cornersResult.cornersExpected1H,
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
                  confidenceScore: Math.round(handicapValue.edge * 1000),
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
                  confidenceScore: Math.round(handicapValue.edge * 1000),
                  oddsAtDetection: handicapValue.bestOdds,
                  bestBookmaker: 'API-Football',
                  status: PickStatus.PENDING,
                  modelInputs: {
                    contextFlags: context.flags,
                    cornersExpected: cornersResult.cornersExpected,
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

    return picks
  }

  /**
   * Find odds for a specific market from API-Football response
   */
  private findOddsForMarket(
    odds: any,
    marketName: string
  ): number {
    if (!odds?.bookmakers) return 0

    // Determine which line we're looking for
    const isOver05 = marketName === 'over_05_1h'
    const isOver15 = marketName === 'over_15_1h'
    const targetLine = isOver05 ? '0.5' : isOver15 ? '1.5' : '0.5'

    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        if (
          market.marketName.toLowerCase().includes('goals') &&
          market.marketName.toLowerCase().includes('half')
        ) {
          for (const value of market.values) {
            if (
              value.name.toLowerCase().includes('over') &&
              value.name.includes(targetLine)
            ) {
              return value.odds
            }
          }
        }
      }
    }

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
   * Get tomorrow's date string
   */
  private getTomorrowDateString(): string {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualAnalysis(): Promise<{
    picks: number
    combos: number
    leagues: number
  }> {
    this.logger.log('Manual nightly analysis triggered')
    await this.runNightlyAnalysis()

    const today = new Date().toISOString().split('T')[0]
    const picks = await this.bettingPickModel.countDocuments({
      date: { $gte: new Date(today) },
    })
    const combos = await this.bettingComboModel.countDocuments({
      createdAt: { $gte: new Date(today) },
    })
    const leagues = await this.bettingLeagueModel.countDocuments({
      isActive: true,
    })

    return { picks, combos, leagues }
  }
}
