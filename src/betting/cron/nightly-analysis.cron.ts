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
import {
  AnalyzedFixture,
  AnalyzedFixtureDocument,
} from '../schemas/analyzed-fixture.schema'
import { ApiFootballBettingService } from '../services/api-football-betting.service'
import { OddsApiService } from '../services/odds-api.service'
import { ScoringGoalsService } from '../services/scoring-goals.service'
import { ScoringCornersService } from '../services/scoring-corners.service'
import { ScoringCardsService } from '../services/scoring-cards.service'
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
import { NormalizedOdds } from '../services/odds-api.service'

/**
 * ============================================================================
 * PICK SCANNER CRON (formerly "Nightly Analysis")
 * ============================================================================
 *
 * Scans fixtures every 30 minutes to detect value betting opportunities.
 *
 * SMART SCANNING OPTIMIZATION:
 * ----------------------------
 * To minimize API-Football requests (limit: 7,500/day), we track which
 * fixtures have already been analyzed and skip redundant processing.
 *
 * A fixture is RE-ANALYZED only if:
 *   1. It's NEW (never analyzed before)
 *   2. Kickoff is within 3 hours (odds stabilize closer to match time)
 *   3. Last analysis was > 6 hours ago (catch significant odds movements)
 *
 * API SAVINGS:
 *   - Without smart scanning: ~15,000 requests/day (48 runs × 320 req)
 *   - With smart scanning: ~600 requests/day (95% reduction)
 *
 * FLOW:
 *   1. Get fixtures list for target date (cheap: ~1 req per league)
 *   2. Filter to only fixtures needing analysis (smart filtering)
 *   3. For qualifying fixtures: fetch stats, score, detect value
 *   4. Save picks and send Telegram alerts
 *   5. Mark fixtures as analyzed in tracking collection
 *
 * MARKETS ANALYZED:
 *   - Goals 1H (Over 0.5 1H, Over 1.5 1H)
 *   - Corners (totals and handicaps)
 *   - Cards/Tarjetas (totals and first half)
 *
 * @schedule Every 30 minutes, 24/7
 * @timezone America/El_Salvador
 */
@Injectable()
export class NightlyAnalysisCron {
  private readonly logger = new Logger('PickScanner')

  /**
   * Mutex for Telegram notifications - prevents duplicate alerts when multiple scans run concurrently
   * Key: date string (YYYY-MM-DD), Value: true if notification is in progress
   */
  private readonly telegramNotificationLocks = new Map<string, boolean>()

  /**
   * Configuration for smart scanning
   */
  private readonly SCAN_CONFIG = {
    /** Re-analyze if kickoff is within this many hours */
    REANALYZE_HOURS_BEFORE_KICKOFF: 3,
    /** Re-analyze if last scan was more than this many hours ago */
    REANALYZE_AFTER_HOURS: 6,
    /** Maximum fixtures to analyze per scan (prevents runaway API usage) */
    MAX_FIXTURES_PER_SCAN: 50,
  }

  constructor(
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    @InjectModel(AnalyzedFixture.name)
    private analyzedFixtureModel: Model<AnalyzedFixtureDocument>,
    private apiFootballService: ApiFootballBettingService,
    private oddsApiService: OddsApiService,
    private scoringGoalsService: ScoringGoalsService,
    private scoringCornersService: ScoringCornersService,
    private scoringCardsService: ScoringCardsService,
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
   * ========================================================================
   * PICK SCANNER - Main Cron Job
   * ========================================================================
   *
   * Runs every 30 minutes to scan for new betting opportunities.
   *
   * SMART SCANNING:
   * - First scan of the day: analyzes all fixtures (~320 requests)
   * - Subsequent scans: only NEW fixtures or those needing re-analysis (~20-50 requests)
   *
   * SCHEDULE: 7 PM daily (user's timezone from settings)
   * Always scans TOMORROW's matches so user can review overnight
   * and place bets in the morning.
   *
   * @schedule 7:00 PM daily
   * @timezone America/El_Salvador
   */
  @Cron('0 19 * * *', {
    name: 'pick-scanner',
    timeZone: 'America/El_Salvador',
  })
  async runPickScanner(): Promise<void> {
    // At 7 PM, always scan tomorrow's matches
    // Use user's timezone from settings (not server timezone)
    const targetDate = await this.getTomorrowDateStringAsync()

    this.logger.log(
      `🔍 Pick Scanner triggered at 7 PM - Scanning MAÑANA (${targetDate})`
    )

    await this.runNightlyAnalysis('MAÑANA', targetDate)
  }

  /**
   * Determine which date to scan based on current hour (user's timezone)
   *
   * 6 AM - 6 PM: Scan today (markets for today's matches are available)
   * 6 PM - 6 AM: Scan tomorrow (prepare for next day)
   */
  private async getSmartTargetDate(): Promise<{ targetDate: string; isToday: boolean; hour: number; timezone: string }> {
    const timezone = await this.getUserTimezone()
    const now = new Date()
    const localTime = new Date(
      now.toLocaleString('en-US', { timeZone: timezone })
    )

    const hour = localTime.getHours()
    const isToday = hour >= 6 && hour < 18 // 6 AM to 6 PM = scan today

    if (isToday) {
      // Return today's date
      const year = localTime.getFullYear()
      const month = String(localTime.getMonth() + 1).padStart(2, '0')
      const day = String(localTime.getDate()).padStart(2, '0')
      return { targetDate: `${year}-${month}-${day}`, isToday: true, hour, timezone }
    } else {
      // Return tomorrow's date
      localTime.setDate(localTime.getDate() + 1)
      const year = localTime.getFullYear()
      const month = String(localTime.getMonth() + 1).padStart(2, '0')
      const day = String(localTime.getDate()).padStart(2, '0')
      return { targetDate: `${year}-${month}-${day}`, isToday: false, hour, timezone }
    }
  }

  /**
   * Check if a pick already exists for this fixture and market
   */
  private async pickExists(fixtureId: number, market: MarketType): Promise<boolean> {
    const existing = await this.bettingPickModel.findOne({
      fixtureId,
      market,
    }).exec()

    if (existing) {
      this.logger.debug(`Pick already exists: fixtureId=${fixtureId}, market=${market}`)
    }

    return !!existing
  }

  // ==========================================================================
  // SMART SCANNING METHODS
  // ==========================================================================

  /**
   * Check if a fixture needs to be analyzed.
   *
   * Returns TRUE (needs analysis) if:
   *   1. Fixture has NEVER been analyzed
   *   2. Kickoff is within REANALYZE_HOURS_BEFORE_KICKOFF (odds stabilize)
   *   3. Last analysis was more than REANALYZE_AFTER_HOURS ago
   *
   * @param fixtureId - The API-Football fixture ID
   * @param kickoff - The match kickoff time
   * @param date - The match date (YYYY-MM-DD)
   * @returns Boolean indicating if analysis is needed
   */
  private async needsAnalysis(
    fixtureId: number,
    kickoff: Date,
    date: string
  ): Promise<{ needsAnalysis: boolean; reason: string }> {
    const now = new Date()
    const hoursUntilKickoff = (kickoff.getTime() - now.getTime()) / (1000 * 60 * 60)

    // Check if we have an existing analysis record
    const existing = await this.analyzedFixtureModel.findOne({
      fixtureId,
      date,
    }).exec()

    // Case 1: Never analyzed - definitely needs analysis
    if (!existing) {
      return { needsAnalysis: true, reason: 'NEW' }
    }

    // Case 2: Kickoff is within threshold - re-analyze for final odds
    if (hoursUntilKickoff <= this.SCAN_CONFIG.REANALYZE_HOURS_BEFORE_KICKOFF) {
      return { needsAnalysis: true, reason: 'PRE_MATCH' }
    }

    // Case 3: Last analysis was too long ago - check for odds movements
    const hoursSinceLastAnalysis =
      (now.getTime() - existing.lastAnalyzedAt.getTime()) / (1000 * 60 * 60)

    if (hoursSinceLastAnalysis >= this.SCAN_CONFIG.REANALYZE_AFTER_HOURS) {
      return { needsAnalysis: true, reason: 'STALE' }
    }

    // No analysis needed - skip this fixture
    return { needsAnalysis: false, reason: 'CACHED' }
  }

  /**
   * Mark a fixture as analyzed in the tracking collection.
   *
   * @param fixture - The fixture data
   * @param date - The match date
   * @param leagueId - The league ID
   * @param pickGenerated - Whether a pick was generated
   */
  private async markAsAnalyzed(
    fixture: { fixtureId: number; homeTeamName: string; awayTeamName: string; kickoff: string },
    date: string,
    leagueId: number,
    pickGenerated: boolean
  ): Promise<void> {
    await this.analyzedFixtureModel.findOneAndUpdate(
      { fixtureId: fixture.fixtureId, date },
      {
        $set: {
          leagueId,
          kickoff: new Date(fixture.kickoff),
          lastAnalyzedAt: new Date(),
          homeTeam: fixture.homeTeamName,
          awayTeam: fixture.awayTeamName,
          pickGenerated,
          expiresAt: new Date(), // Reset TTL
        },
        $inc: { analysisCount: 1 },
      },
      { upsert: true, new: true }
    ).exec()
  }

  /**
   * Get smart scanning statistics for logging
   */
  private async getScanStats(date: string): Promise<{
    totalAnalyzed: number
    withPicks: number
    avgAnalysisCount: number
  }> {
    const stats = await this.analyzedFixtureModel.aggregate([
      { $match: { date } },
      {
        $group: {
          _id: null,
          totalAnalyzed: { $sum: 1 },
          withPicks: { $sum: { $cond: ['$pickGenerated', 1, 0] } },
          avgAnalysisCount: { $avg: '$analysisCount' },
        },
      },
    ]).exec()

    return stats[0] || { totalAnalyzed: 0, withPicks: 0, avgAnalysisCount: 0 }
  }

  // ==========================================================================
  // CORE ANALYSIS LOGIC
  // ==========================================================================

  /**
   * Core nightly analysis logic
   * @param dayLabel Label for logging (e.g., "HOY", "MAÑANA")
   * @param overrideDate Optional date to analyze (YYYY-MM-DD format)
   */
  private async runNightlyAnalysis(dayLabel: string, overrideDate?: string): Promise<void> {
    this.logger.log(`Starting nightly analysis for ${dayLabel} matches...`)
    const startTime = Date.now()

    try {
      // Check if betting is active
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.isActive) {
        this.logger.log('Betting is paused, skipping nightly analysis')
        return
      }

      // Get target date and timezone
      const timezone = settings?.timezone || 'America/El_Salvador'
      const tomorrowDate = overrideDate || this.getTomorrowDateString(timezone)
      this.logger.log(`Analyzing fixtures for ${dayLabel}: ${tomorrowDate} (timezone: ${timezone})`)

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
          settings.bankroll,
          timezone
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
      // 1. Filter picks with probability >= 65%
      // 2. Sort by probability (higher = better)
      // 3. Max 2 picks per match (fixtureId) for diversification
      // 4. Max picks from settings (default 5)
      const maxPicks = settings.stakes?.maxPicksPerDay || 5
      const maxPicksPerMatch = 2
      const minProbability = 0.65 // Minimum 65% win probability

      this.logger.log(`Pick limits: max ${maxPicks} picks/day, max ${maxPicksPerMatch} per match`)

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

      // REMOVED: Don't delete existing picks - they may have been notified
      // The duplicate detection (`pickExists`) prevents creating duplicates
      // Only delete picks that haven't been notified yet (fresh picks from failed runs)
      // This preserves picks that users have already been alerted about

      // Calculate stakes for individual picks (in 0.25u increments)
      const unitValue = settings.stakes?.fixedStake || 10  // 1u = fixedStake or $10
      const maxDailyExposurePct = settings.stakes?.maxDailyExposurePct || 0.15  // Default 15%
      const maxDailyExposure = settings.bankroll * maxDailyExposurePct

      // First pass: calculate raw stakes
      for (const pickDoc of topPickDocs) {
        const stake = this.stakeCalculatorService.calculatePickStake(
          pickDoc.probOwn || 0,
          pickDoc.oddsAtDetection || 1,
          pickDoc.edge || 0,
          settings.bankroll,
          {
            useFixedStake: settings.stakes?.useFixedStake || false,
            fixedStake: settings.stakes?.fixedStake,
            unitValue,
          }
        )
        pickDoc.stake = stake
      }

      // Second pass: check total exposure and scale down if needed
      const totalExposure = topPickDocs.reduce((sum, p) => sum + (p.stake || 0), 0)
      if (totalExposure > maxDailyExposure) {
        const scaleFactor = maxDailyExposure / totalExposure
        this.logger.warn(
          `Total exposure $${totalExposure.toFixed(2)} exceeds max $${maxDailyExposure.toFixed(2)} ` +
          `(${(maxDailyExposurePct * 100).toFixed(0)}%) - scaling down by ${(scaleFactor * 100).toFixed(0)}%`
        )

        // Scale down and round to 0.25u increments
        for (const pickDoc of topPickDocs) {
          const scaledStake = (pickDoc.stake || 0) * scaleFactor
          // Round to nearest 0.25u
          const scaledUnits = Math.round((scaledStake / unitValue) * 4) / 4
          // Minimum 0.25u
          const finalUnits = Math.max(0.25, scaledUnits)
          pickDoc.stake = finalUnits * unitValue
        }

        const newTotal = topPickDocs.reduce((sum, p) => sum + (p.stake || 0), 0)
        this.logger.log(
          `Stakes scaled: $${totalExposure.toFixed(2)} → $${newTotal.toFixed(2)} ` +
          `(${((newTotal / settings.bankroll) * 100).toFixed(1)}% of bankroll)`
        )
      }

      // Save only top picks to database (max 5)
      // Use ordered: false to continue inserting even if some fail due to duplicates
      const savedPicksMap = new Map<string, string>()
      let savedPickResults: any[] = []
      try {
        savedPickResults = await this.bettingPickModel.insertMany(topPickDocs, { ordered: false })
      } catch (error: any) {
        // Handle duplicate key errors (code 11000) - extract successfully inserted docs
        if (error.code === 11000 || error.writeErrors) {
          savedPickResults = error.insertedDocs || []
          const duplicateCount = topPickDocs.length - savedPickResults.length
          this.logger.warn(`Skipped ${duplicateCount} duplicate picks`)
        } else {
          throw error
        }
      }
      savedPickResults.forEach((pick: any, idx: number) => {
        if (pick && pick.fixtureId) {
          const key = `${pick.fixtureId}-${pick.market}-${pick.direction}`
          savedPicksMap.set(key, pick._id.toString())
        }
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

      // Smart Telegram Alerts: Only notify for NEW picks (not already notified)
      // Use MUTEX + ATOMIC approach to prevent duplicate alerts when multiple scans run concurrently
      // IMPORTANT: Convert local date to UTC range for correct querying
      // For date "2026-03-28" in El Salvador (UTC-6):
      //   Start: 2026-03-28 00:00 local = 2026-03-28 06:00 UTC
      //   End: 2026-03-28 23:59 local = 2026-03-29 05:59 UTC
      const { start: targetDateStart, end: targetDateEnd } = this.getLocalDateRangeInUTC(tomorrowDate, timezone)

      // Check if another scan is already handling notifications for this date
      if (this.telegramNotificationLocks.get(tomorrowDate)) {
        this.logger.log(`Another scan is already handling Telegram notifications for ${tomorrowDate} - skipping`)
      } else {
        // Acquire lock for this date
        this.telegramNotificationLocks.set(tomorrowDate, true)
        this.logger.debug(`Acquired Telegram notification lock for ${tomorrowDate}`)

        try {
          // Query unnotified picks (we have the lock, so no race condition)
          const unnotifiedPicks = await this.bettingPickModel
            .find({
              kickoff: { $gte: targetDateStart, $lte: targetDateEnd },
              telegramAlertSent: { $ne: true }
            })
            .exec()

          const unnotifiedCombos = await this.bettingComboModel
            .find({
              date: { $gte: targetDateStart, $lte: targetDateEnd },
              telegramAlertSent: { $ne: true }
            })
            .exec()

          this.logger.debug(`Found ${unnotifiedPicks.length} unnotified picks, ${unnotifiedCombos.length} unnotified combos`)

          // Only send alert if there are NEW picks/combos to notify about
          if (unnotifiedPicks.length > 0 || unnotifiedCombos.length > 0) {
            this.logger.log(
              `Sending Telegram alert for ${unnotifiedPicks.length} NEW picks, ${unnotifiedCombos.length} NEW combos`
            )

            // Get total counts for context
            const totalPicks = await this.bettingPickModel.countDocuments({
              kickoff: { $gte: targetDateStart, $lte: targetDateEnd }
            })
            const totalCombos = await this.bettingComboModel.countDocuments({
              date: { $gte: targetDateStart, $lte: targetDateEnd }
            })

            // Determine if this is initial alert or update
            const isInitialAlert = totalPicks === unnotifiedPicks.length

            // Mark picks as notified BEFORE sending (to prevent duplicates if send is slow)
            const pickIds = unnotifiedPicks.map(p => p._id)
            const comboIds = unnotifiedCombos.map(c => c._id)

            await this.bettingPickModel.updateMany(
              { _id: { $in: pickIds } },
              { $set: { telegramAlertSent: true } }
            )
            if (comboIds.length > 0) {
              await this.bettingComboModel.updateMany(
                { _id: { $in: comboIds } },
                { $set: { telegramAlertSent: true } }
              )
            }

            try {
              // Use T12:00:00Z so the date displays correctly in any timezone
              // (midnight UTC would show previous day in negative UTC offsets like America/El_Salvador)
              const displayDate = new Date(`${tomorrowDate}T12:00:00Z`)
              await this.telegramService.sendNightlyAnalysisAlert(
                displayDate,
                unnotifiedPicks,
                unnotifiedCombos,
                fixturesAnalyzed,
                activeLeagues.length,
                isInitialAlert ? 'initial' : 'update',
                totalPicks,
                totalCombos
              )
              this.logger.log(`Telegram alert sent successfully for ${unnotifiedPicks.length} picks`)
            } catch (telegramError) {
              // If Telegram fails, revert the marks so they can be retried
              this.logger.error(`Telegram alert failed: ${telegramError}`)
              this.logger.warn(`Reverting ${pickIds.length} picks and ${comboIds.length} combos to unnotified state`)

              await this.bettingPickModel.updateMany(
                { _id: { $in: pickIds } },
                { $set: { telegramAlertSent: false } }
              )
              if (comboIds.length > 0) {
                await this.bettingComboModel.updateMany(
                  { _id: { $in: comboIds } },
                  { $set: { telegramAlertSent: false } }
                )
              }
            }
          } else {
            this.logger.log('No new picks to notify - skipping Telegram alert')
          }
        } finally {
          // Always release the lock
          this.telegramNotificationLocks.delete(tomorrowDate)
          this.logger.debug(`Released Telegram notification lock for ${tomorrowDate}`)
        }
      }

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
   * Fetch odds from The Odds API for a league (cached per league/market)
   * Returns a Map of odds keyed by normalized team names for quick lookup
   */
  private async fetchOddsApiOdds(
    league: BettingLeagueDocument,
    market: string = 'totals'
  ): Promise<Map<string, NormalizedOdds[]>> {
    const oddsMap = new Map<string, NormalizedOdds[]>()

    // Only call The Odds API if league has "sharps" in marketStrengths
    const hasSharps = league.marketStrengths?.includes('sharps') ?? false
    if (!hasSharps) {
      return oddsMap
    }

    if (!league.hasOddsApi || !league.oddsApiSportKey) {
      this.logger.debug(
        `League ${league.name} has 'sharps' but no oddsApiSportKey configured`
      )
      return oddsMap
    }

    try {
      const normalizedOdds = await this.oddsApiService.getNormalizedOdds(
        league.oddsApiSportKey,
        market
      )

      for (const odds of normalizedOdds) {
        // Create a normalized key from team names (lowercase, remove accents)
        const key = this.normalizeTeamKey(odds.homeTeam, odds.awayTeam)
        const existing = oddsMap.get(key) || []
        existing.push(odds)
        oddsMap.set(key, existing)
      }

      this.logger.log(
        `Fetched ${normalizedOdds.length} events from The Odds API for ${league.name} (${market})`
      )
    } catch (error) {
      this.logger.warn(`Failed to fetch The Odds API for ${league.name}: ${error.message}`)
    }

    return oddsMap
  }

  /**
   * Normalize team names for matching between APIs
   */
  private normalizeTeamKey(homeTeam: string, awayTeam: string): string {
    const normalize = (name: string) =>
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
    return `${normalize(homeTeam)}_${normalize(awayTeam)}`
  }

  /**
   * Find The Odds API odds for a specific fixture
   */
  private findOddsApiMatch(
    oddsMap: Map<string, NormalizedOdds[]>,
    homeTeam: string,
    awayTeam: string,
    line?: number
  ): NormalizedOdds | null {
    const key = this.normalizeTeamKey(homeTeam, awayTeam)
    const matches = oddsMap.get(key)

    if (!matches || matches.length === 0) {
      // Try fuzzy matching
      for (const [mapKey, odds] of oddsMap.entries()) {
        // Check if any team name contains our search
        const homeNorm = this.normalizeTeamKey(homeTeam, '')
        const awayNorm = this.normalizeTeamKey(awayTeam, '')
        if (mapKey.includes(homeNorm.replace('_', '')) && mapKey.includes(awayNorm.replace('_', ''))) {
          if (line === undefined) return odds[0]
          const lineMatch = odds.find((o) => o.line === line)
          if (lineMatch) return lineMatch
        }
      }
      return null
    }

    if (line === undefined) {
      return matches[0]
    }

    return matches.find((o) => o.line === line) || null
  }

  /**
   * Get the best odds from The Odds API or API-Football
   * Returns the best odds and bookmaker info
   */
  private getBestOddsFromSources(
    apiFootballOdds: number,
    oddsApiMatch: NormalizedOdds | null,
    direction: 'over' | 'under'
  ): {
    bestOdds: number
    bestBookmaker: string
    pinnacleOdds?: number
    edgeVsPinnacle?: number
    allBookmakers?: string[]
  } {
    let bestOdds = apiFootballOdds
    let bestBookmaker = 'API-Football'
    let pinnacleOdds: number | undefined
    let edgeVsPinnacle: number | undefined
    let allBookmakers: string[] = []

    if (oddsApiMatch) {
      const oddsApiPrice =
        direction === 'over'
          ? oddsApiMatch.bestOver?.price
          : oddsApiMatch.bestUnder?.price
      const oddsApiBookmaker =
        direction === 'over'
          ? oddsApiMatch.bestOver?.bookmaker
          : oddsApiMatch.bestUnder?.bookmaker

      if (oddsApiPrice && oddsApiPrice > bestOdds) {
        bestOdds = oddsApiPrice
        bestBookmaker = this.formatBookmakerName(oddsApiBookmaker || 'The Odds API')
      }

      // Track Pinnacle as sharp reference
      pinnacleOdds =
        direction === 'over' ? oddsApiMatch.pinnacleOver : oddsApiMatch.pinnacleUnder

      if (pinnacleOdds) {
        edgeVsPinnacle = this.oddsApiService.calculateEdgeVsPinnacle(
          oddsApiMatch,
          direction
        )
      }

      // Collect all bookmaker names
      allBookmakers = oddsApiMatch.allBookmakers.map((b) =>
        this.formatBookmakerName(b.bookmaker)
      )
    }

    return { bestOdds, bestBookmaker, pinnacleOdds, edgeVsPinnacle, allBookmakers }
  }

  /**
   * Format bookmaker key to readable name
   */
  private formatBookmakerName(key: string): string {
    const names: Record<string, string> = {
      pinnacle: 'Pinnacle',
      bet365: 'Bet365',
      betfair: 'Betfair',
      '1xbet': '1xBet',
      williamhill: 'William Hill',
      unibet: 'Unibet',
      betway: 'Betway',
      bwin: 'Bwin',
      ladbrokes: 'Ladbrokes',
      marathonbet: 'Marathonbet',
      betvictor: 'BetVictor',
      paddypower: 'Paddy Power',
      draftkings: 'DraftKings',
      fanduel: 'FanDuel',
      bovada: 'Bovada',
    }
    return names[key.toLowerCase()] || key
  }

  /**
   * Analyze a single league for value picks
   *
   * SMART SCANNING OPTIMIZATION:
   * - First gets fixture list (cheap API call)
   * - Filters to only fixtures needing analysis
   * - Skips already-analyzed fixtures unless:
   *   1. Kickoff is within 3 hours
   *   2. Last analysis was > 6 hours ago
   *
   * @returns picks array and count of fixtures actually analyzed
   */
  private async analyzeLeague(
    league: BettingLeagueDocument,
    date: string,
    contexts: Map<number, any>,
    bankroll: number,
    timezone: string = 'America/El_Salvador'
  ): Promise<{ picks: Array<{ leg: ComboLeg; document: Partial<BettingPick> }>; fixturesCount: number }> {
    const picks: Array<{ leg: ComboLeg; document: Partial<BettingPick> }> = []
    let fixturesCount = 0

    try {
      // Get fixtures for this league using LOCAL date with timezone
      // This handles UTC date issues where evening matches appear as next day in UTC
      const fixtures = await this.apiFootballService.getFixturesForLocalDate(
        date,
        league.apiFootballId,
        league.season || '2025',
        timezone
      )

      if (!fixtures || fixtures.length === 0) {
        this.logger.debug(`No fixtures found for ${league.name} on ${date}`)
        return { picks, fixturesCount: 0 }
      }

      // Filter out fixtures that have already started (kickoff in the past)
      const now = new Date()
      const upcomingFixtures = fixtures.filter(f => new Date(f.kickoff) > now)

      if (upcomingFixtures.length < fixtures.length) {
        this.logger.debug(
          `Filtered ${fixtures.length - upcomingFixtures.length} finished/in-progress fixtures for ${league.name}`
        )
      }

      this.logger.debug(`Found ${upcomingFixtures.length} upcoming fixtures for ${league.name}`)

      // ========================================================================
      // SMART SCANNING: Filter to only fixtures that need analysis
      // ========================================================================
      const fixturesToAnalyze: typeof upcomingFixtures = []
      const scanReasons: Record<string, number> = { NEW: 0, PRE_MATCH: 0, STALE: 0, CACHED: 0 }

      for (const fixture of upcomingFixtures) {
        const { needsAnalysis: needs, reason } = await this.needsAnalysis(
          fixture.fixtureId,
          new Date(fixture.kickoff),
          date
        )
        scanReasons[reason]++

        if (needs) {
          fixturesToAnalyze.push(fixture)
        }
      }

      // Log smart scanning stats
      const skipped = upcomingFixtures.length - fixturesToAnalyze.length
      if (skipped > 0) {
        this.logger.log(
          `⚡ Smart scan: ${fixturesToAnalyze.length}/${upcomingFixtures.length} fixtures need analysis ` +
          `(${scanReasons.NEW} new, ${scanReasons.PRE_MATCH} pre-match, ${scanReasons.STALE} stale, ${scanReasons.CACHED} cached)`
        )
      } else {
        this.logger.log(`📊 Analyzing all ${upcomingFixtures.length} fixtures for ${league.name}`)
      }

      fixturesCount = fixturesToAnalyze.length

      // If no fixtures need analysis, skip this league
      if (fixturesToAnalyze.length === 0) {
        this.logger.debug(`No fixtures need analysis for ${league.name} - all cached`)
        return { picks, fixturesCount: 0 }
      }

      // Check if league uses Pinnacle/sharps strategy
      const usesSharps = league.marketStrengths?.includes('sharps') ?? false

      // Fetch The Odds API data only for leagues with "sharps" in marketStrengths
      // This saves API calls - only ~9 leagues use Pinnacle comparison
      let oddsApiTotals = new Map<string, NormalizedOdds[]>()
      let oddsApiTotalsH1 = new Map<string, NormalizedOdds[]>()

      if (usesSharps) {
        this.logger.log(`📊 ${league.name} uses SHARPS strategy - fetching Pinnacle lines...`)
        const [totals, totalsH1] = await Promise.all([
          this.fetchOddsApiOdds(league, 'totals'),
          this.fetchOddsApiOdds(league, 'totals_h1'),
        ])
        oddsApiTotals = totals
        oddsApiTotalsH1 = totalsH1

        const hasOddsApiData = oddsApiTotals.size > 0 || oddsApiTotalsH1.size > 0
        if (hasOddsApiData) {
          this.logger.log(
            `✅ Pinnacle data for ${league.name}: ${oddsApiTotals.size} totals, ${oddsApiTotalsH1.size} 1H events`
          )
        } else {
          this.logger.debug(`⚠️ No Pinnacle data available for ${league.name}`)
        }
      } else {
        this.logger.debug(`${league.name} uses MODEL-ONLY strategy (no sharps)`)
      }

      // Track if any picks were generated for this fixture
      let fixtureGeneratedPick = false

      for (const fixture of fixturesToAnalyze) {
        this.logger.debug(`Analyzing: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`)
        fixtureGeneratedPick = false

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

        // Detect value for Over 0.5 1H (or Over 1.5 1H if odds are too low)
        if (goalsResult.probOver05_1H > 0 && odds) {
          const apiFootballOdds = this.findOddsForMarket(odds, 'over_05_1h')

          // Check The Odds API for better odds (totals_h1 for first half goals)
          const oddsApiMatch = this.findOddsApiMatch(
            oddsApiTotalsH1,
            fixture.homeTeamName,
            fixture.awayTeamName,
            0.5
          )

          const { bestOdds: over05Odds, bestBookmaker, pinnacleOdds, edgeVsPinnacle, allBookmakers } =
            this.getBestOddsFromSources(apiFootballOdds, oddsApiMatch, 'over')

          this.logger.debug(
            `Over 0.5 1H odds: API-Football=${apiFootballOdds}, Best=${over05Odds} (${bestBookmaker})` +
            (pinnacleOdds ? `, Pinnacle=${pinnacleOdds}` : '')
          )

          // ============================================================
          // INTELLIGENT MARKET SELECTION
          // If Over 0.5 1H odds are too low (<1.40), check if Over 1.5 1H
          // is a better value bet based on team scoring patterns
          // ============================================================
          const MIN_ODDS_OVER_05 = 1.40
          const MIN_EXPECTED_GOALS_FOR_OVER_15 = 1.3
          const MIN_PROB_OVER_15 = 0.50

          if (over05Odds > 1.0 && over05Odds < MIN_ODDS_OVER_05) {
            // Over 0.5 1H odds too low - check if Over 1.5 1H is better
            this.logger.debug(
              `Over 0.5 1H odds ${over05Odds} < ${MIN_ODDS_OVER_05} - checking Over 1.5 1H as alternative`
            )

            // Check if this is a high-scoring match where Over 1.5 1H makes sense
            const isHighScoring =
              goalsResult.expectedGoals1H >= MIN_EXPECTED_GOALS_FOR_OVER_15 &&
              goalsResult.probOver15_1H >= MIN_PROB_OVER_15

            if (isHighScoring) {
              // Get Over 1.5 1H odds
              const over15ApiOdds = this.findOddsForMarket(odds, 'over_15_1h')
              const over15OddsApiMatch = this.findOddsApiMatch(
                oddsApiTotalsH1,
                fixture.homeTeamName,
                fixture.awayTeamName,
                1.5
              )

              const { bestOdds: over15Odds, bestBookmaker: over15Bookmaker } =
                this.getBestOddsFromSources(over15ApiOdds, over15OddsApiMatch, 'over')

              if (over15Odds > 1.5) {
                const over15ValueResult = this.valueDetectionService.detectValueGoals(
                  goalsResult,
                  'over_15_1h',
                  over15Odds,
                  over15Bookmaker,
                  undefined,
                  teamAStats.gamesPlayed,
                  teamBStats.gamesPlayed
                )

                this.logger.debug(
                  `Over 1.5 1H alternative: odds=${over15Odds}, hasValue=${over15ValueResult.hasValue}, ` +
                  `edge=${(over15ValueResult.edge * 100).toFixed(1)}%, ` +
                  `expectedGoals1H=${goalsResult.expectedGoals1H.toFixed(2)}, ` +
                  `probOver15=${(goalsResult.probOver15_1H * 100).toFixed(1)}%`
                )

                if (over15ValueResult.hasValue) {
                  // Use Over 1.5 1H instead - create pick with this market
                  const alreadyExists = await this.pickExists(fixture.fixtureId, MarketType.OVER_15_1H)
                  if (!alreadyExists) {
                    const timeWindow = this.determineTimeWindow(new Date(fixture.kickoff))

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
                        edge: over15ValueResult.edge,
                        confidenceScore: Math.min(100, Math.round(over15ValueResult.edge * 500 + 40)),
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
                        teamHome: { id: fixture.homeTeamId, name: fixture.homeTeamName },
                        teamAway: { id: fixture.awayTeamId, name: fixture.awayTeamName },
                        kickoff: new Date(fixture.kickoff),
                        timeWindow,
                        market: MarketType.OVER_15_1H,
                        direction: MarketDirection.OVER,
                        line: 1.5,
                        probOwn: goalsResult.probOver15_1H,
                        probImplied: over15ValueResult.probImplied,
                        edge: over15ValueResult.edge,
                        confidenceScore: Math.min(100, Math.round(over15ValueResult.edge * 500 + 40)),
                        oddsAtDetection: over15Odds,
                        bestBookmaker: over15Bookmaker,
                        status: PickStatus.PENDING,
                        stars: this.calculateStars(over15ValueResult.edge),
                        reasons: [
                          `Over 0.5 1H odds muy bajas (${over05Odds.toFixed(2)}) → Over 1.5 1H es mejor value`,
                          `Promedio ${goalsResult.expectedGoals1H.toFixed(1)} goles en 1H`,
                          `${(goalsResult.probOver15_1H * 100).toFixed(0)}% prob de 2+ goles en 1H`,
                          ...this.generateGoalsReasons('over_15_1h', teamAStats, teamBStats, h2h, league, goalsResult)
                        ],
                        modelInputs: {
                          dataSource: over15Bookmaker.includes('API-Football') ? 'API-Football' : 'The Odds API',
                          contextFlags: context.flags,
                          expectedGoals1H: goalsResult.expectedGoals1H,
                          originalOver05Odds: over05Odds,
                          switchedToOver15: true,
                          teamAStats: {
                            name: fixture.homeTeamName,
                            avgGoals1H: teamAStats.avg_goals_1h,
                            avgConceded1H: teamAStats.avg_conceded_1h,
                            gamesPlayed: teamAStats.gamesPlayed,
                          },
                          teamBStats: {
                            name: fixture.awayTeamName,
                            avgGoals1H: teamBStats.avg_goals_1h,
                            avgConceded1H: teamBStats.avg_conceded_1h,
                            gamesPlayed: teamBStats.gamesPlayed,
                          },
                          ...this.getWeatherFields(weather, context),
                        },
                      },
                    })
                    fixtureGeneratedPick = true
                    this.logger.log(
                      `✅ Switched to Over 1.5 1H: ${fixture.homeTeamName} vs ${fixture.awayTeamName} ` +
                      `@${over15Odds} (edge: ${(over15ValueResult.edge * 100).toFixed(1)}%)`
                    )
                  }
                }
              }
            } else {
              this.logger.debug(
                `Over 0.5 1H odds too low and Over 1.5 1H not viable: ` +
                `expectedGoals1H=${goalsResult.expectedGoals1H.toFixed(2)} (need >=${MIN_EXPECTED_GOALS_FOR_OVER_15}), ` +
                `probOver15=${(goalsResult.probOver15_1H * 100).toFixed(1)}% (need >=${MIN_PROB_OVER_15 * 100}%)`
              )
            }
            // Skip Over 0.5 1H since odds are too low
          } else if (over05Odds >= MIN_ODDS_OVER_05) {
            // Normal Over 0.5 1H analysis (odds are acceptable)
            const valueResult = this.valueDetectionService.detectValueGoals(
              goalsResult,
              'over_05_1h',
              over05Odds,
              bestBookmaker,
              undefined,
              teamAStats.gamesPlayed,
              teamBStats.gamesPlayed
            )

            this.logger.debug(
              `Value detection Over 0.5 1H: hasValue=${valueResult.hasValue}, edge=${(valueResult.edge * 100).toFixed(1)}%` +
              (edgeVsPinnacle !== undefined ? `, edgeVsPinnacle=${(edgeVsPinnacle * 100).toFixed(1)}%` : '')
            )

            if (valueResult.hasValue) {
              // FILTER: Minimum stars (exclude weak picks)
              const MIN_STARS = 3
              const stars = this.calculateStars(valueResult.edge)
              if (stars < MIN_STARS) {
                this.logger.debug(
                  `Skip Over 0.5 1H ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ${stars} stars < ${MIN_STARS} required`
                )
              } else {
              // Check if pick already exists for this fixture+market
              const alreadyExists = await this.pickExists(fixture.fixtureId, MarketType.OVER_05_1H)
              if (alreadyExists) {
                this.logger.debug(`Skip duplicate: ${fixture.homeTeamName} vs ${fixture.awayTeamName} - OVER_05_1H`)
              } else {
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
                  bestBookmaker,
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
                    dataSource: bestBookmaker.includes('API-Football') ? 'API-Football' : 'The Odds API',
                    contextFlags: context.flags,
                    expectedGoals1H: goalsResult.expectedGoals1H,
                    pinnacleOdds,
                    edgeVsPinnacle,
                    allBookmakers: allBookmakers?.slice(0, 5),
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
                    calculationExplanation: `Probabilidad calculada usando stats de ${teamAStats.gamesPlayed} partidos del local y ${teamBStats.gamesPlayed} del visitante. xG 1H: ${goalsResult.expectedGoals1H?.toFixed(2) || 'N/A'}.` +
                      (pinnacleOdds ? ` Línea Pinnacle: ${pinnacleOdds.toFixed(2)} (referencia sharp).` : ''),
                    ...this.getWeatherFields(weather, context),
                  },
                },
              })
              fixtureGeneratedPick = true
              } // end else (not duplicate)
              } // end else (stars >= MIN_STARS)
            }
          }
        }

        // Detect value for Over 1.5 1H (higher risk, higher reward)
        if (goalsResult.probOver15_1H > 0 && odds) {
          const apiFootball15Odds = this.findOddsForMarket(odds, 'over_15_1h')

          // Check The Odds API for better odds
          const oddsApiMatch15 = this.findOddsApiMatch(
            oddsApiTotalsH1,
            fixture.homeTeamName,
            fixture.awayTeamName,
            1.5
          )

          const { bestOdds: over15Odds, bestBookmaker: bestBookie15, pinnacleOdds: pinnacle15, edgeVsPinnacle: edgeVsPin15, allBookmakers: allBookie15 } =
            this.getBestOddsFromSources(apiFootball15Odds, oddsApiMatch15, 'over')

          if (over15Odds > 1.0) {
            const valueResult = this.valueDetectionService.detectValueGoals(
              goalsResult,
              'over_15_1h',
              over15Odds,
              bestBookie15,
              undefined,
              teamAStats.gamesPlayed,
              teamBStats.gamesPlayed
            )

            if (valueResult.hasValue) {
              // Check if pick already exists for this fixture+market
              const alreadyExists = await this.pickExists(fixture.fixtureId, MarketType.OVER_15_1H)
              if (alreadyExists) {
                this.logger.debug(`Skip duplicate: ${fixture.homeTeamName} vs ${fixture.awayTeamName} - OVER_15_1H`)
              } else {
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
                  bestBookmaker: bestBookie15,
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
                    dataSource: bestBookie15.includes('API-Football') ? 'API-Football' : 'The Odds API',
                    contextFlags: context.flags,
                    expectedGoals1H: goalsResult.expectedGoals1H,
                    pinnacleOdds: pinnacle15,
                    edgeVsPinnacle: edgeVsPin15,
                    allBookmakers: allBookie15?.slice(0, 5),
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
                    calculationExplanation: `Over 1.5 1H requiere que ambos equipos marquen. Local promedia ${teamAStats.avg_goals_1h?.toFixed(2)} goles/1H, visitante ${teamBStats.avg_goals_1h?.toFixed(2)}. xG combinado: ${goalsResult.expectedGoals1H?.toFixed(2) || 'N/A'}.` +
                      (pinnacle15 ? ` Línea Pinnacle: ${pinnacle15.toFixed(2)}.` : ''),
                    ...this.getWeatherFields(weather, context),
                  },
                },
              })
              fixtureGeneratedPick = true
              } // end else (not duplicate)
            }
          }
        }

        // ============================================================
        // BTTS 1H (Both Teams To Score in First Half)
        // ============================================================
        if (goalsResult.probBTTS_1H > 0.20 && odds) {
          const btts1HOdds = this.findBTTS1HOdds(odds)

          if (btts1HOdds && btts1HOdds > 1.40) {
            const bttsValueResult = this.scoringGoalsService.calculateEdgeBTTS(goalsResult, btts1HOdds)

            this.logger.debug(
              `BTTS 1H: ${fixture.homeTeamName} vs ${fixture.awayTeamName} ` +
              `odds=${btts1HOdds}, probOwn=${(goalsResult.probBTTS_1H * 100).toFixed(1)}%, ` +
              `hasValue=${bttsValueResult.hasValue}, edge=${(bttsValueResult.edge * 100).toFixed(1)}%`
            )

            if (bttsValueResult.hasValue && bttsValueResult.edge >= 0.05) {
              // FILTER: Minimum stars
              const MIN_STARS = 3
              const stars = this.calculateStars(bttsValueResult.edge)
              if (stars >= MIN_STARS) {
                const alreadyExists = await this.pickExists(fixture.fixtureId, MarketType.BTTS_1H)
                if (!alreadyExists) {
                  const timeWindow = this.determineTimeWindow(new Date(fixture.kickoff))
                  const probImplied = 1 / btts1HOdds

                  picks.push({
                    leg: {
                      fixtureId: fixture.fixtureId,
                      leagueId: league.apiFootballId,
                      homeTeam: fixture.homeTeamName,
                      awayTeam: fixture.awayTeamName,
                      market: MarketType.BTTS_1H,
                      direction: 'OVER',
                      line: 0,
                      odds: btts1HOdds,
                      probOwn: goalsResult.probBTTS_1H,
                      edge: bttsValueResult.edge,
                      confidenceScore: Math.min(100, Math.round(bttsValueResult.edge * 500 + 40)),
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
                      teamHome: { id: fixture.homeTeamId, name: fixture.homeTeamName },
                      teamAway: { id: fixture.awayTeamId, name: fixture.awayTeamName },
                      kickoff: new Date(fixture.kickoff),
                      timeWindow,
                      market: MarketType.BTTS_1H,
                      direction: MarketDirection.OVER,
                      line: 0,
                      probOwn: goalsResult.probBTTS_1H,
                      probImplied,
                      edge: bttsValueResult.edge,
                      confidenceScore: Math.min(100, Math.round(bttsValueResult.edge * 500 + 40)),
                      oddsAtDetection: btts1HOdds,
                      bestBookmaker: 'API-Football',
                      status: PickStatus.PENDING,
                      stars: this.calculateStars(bttsValueResult.edge),
                      reasons: [
                        `Ambos equipos marcan en 1H (BTTS 1H)`,
                        `P(Local marca 1H)=${(goalsResult.expectedGoalsHome1H > 0 ? ((1 - Math.exp(-goalsResult.expectedGoalsHome1H)) * 100) : 0).toFixed(0)}%`,
                        `P(Visitante marca 1H)=${(goalsResult.expectedGoalsAway1H > 0 ? ((1 - Math.exp(-goalsResult.expectedGoalsAway1H)) * 100) : 0).toFixed(0)}%`,
                      ],
                      modelInputs: {
                        dataSource: 'API-Football',
                        contextFlags: context.flags,
                        expectedGoals1H: goalsResult.expectedGoals1H,
                        teamAStats: {
                          name: fixture.homeTeamName,
                          avgGoals1H: teamAStats.avg_goals_1h,
                          avgConceded1H: teamAStats.avg_conceded_1h,
                          gamesPlayed: teamAStats.gamesPlayed,
                        },
                        teamBStats: {
                          name: fixture.awayTeamName,
                          avgGoals1H: teamBStats.avg_goals_1h,
                          avgConceded1H: teamBStats.avg_conceded_1h,
                          gamesPlayed: teamBStats.gamesPlayed,
                        },
                        calculationExplanation: `BTTS 1H = P(Local≥1) × P(Visitante≥1) usando Poisson. xG Local 1H: ${goalsResult.expectedGoalsHome1H?.toFixed(2)}, xG Visitante 1H: ${goalsResult.expectedGoalsAway1H?.toFixed(2)}.`,
                        ...this.getWeatherFields(weather, context),
                      },
                    },
                  })
                  fixtureGeneratedPick = true
                  this.logger.log(
                    `⚽⚽ BTTS 1H pick: ${fixture.homeTeamName} vs ${fixture.awayTeamName} ` +
                    `@${btts1HOdds.toFixed(2)} (edge: ${(bttsValueResult.edge * 100).toFixed(1)}%)`
                  )
                }
              }
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
                'API-Football',
                teamAStats.gamesPlayed,
                teamBStats.gamesPlayed
              )

              if (valueResult.hasValue) {
                // FILTER: Minimum odds for corners (same as Over 0.5 1H)
                const MIN_ODDS_CORNERS = 1.40
                if (valueResult.bestOdds < MIN_ODDS_CORNERS) {
                  this.logger.debug(
                    `Skip corners ${fixture.homeTeamName} vs ${fixture.awayTeamName}: odds ${valueResult.bestOdds} < ${MIN_ODDS_CORNERS}`
                  )
                  continue
                }

                // FILTER: Minimum stars (exclude weak picks)
                const MIN_STARS = 3
                const stars = this.calculateStars(valueResult.edge)
                if (stars < MIN_STARS) {
                  this.logger.debug(
                    `Skip corners ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ${stars} stars < ${MIN_STARS} required`
                  )
                  continue
                }

                // FILTER: Minimum sample size for corners (higher than goals)
                // Corners data is less reliable, need more games for confidence
                const MIN_GAMES_CORNERS = 5
                if (teamAStats.gamesPlayed < MIN_GAMES_CORNERS || teamBStats.gamesPlayed < MIN_GAMES_CORNERS) {
                  this.logger.debug(
                    `Skip corners ${fixture.homeTeamName} vs ${fixture.awayTeamName}: insufficient data ` +
                    `(${teamAStats.gamesPlayed}+${teamBStats.gamesPlayed} games, need ${MIN_GAMES_CORNERS}+ each)`
                  )
                  continue
                }

                const market = this.getCornersMarketType(
                  line,
                  valueResult.direction
                )

                // Check if pick already exists for this fixture+market
                const alreadyExists = await this.pickExists(fixture.fixtureId, market)
                if (alreadyExists) {
                  this.logger.debug(`Skip duplicate: ${fixture.homeTeamName} vs ${fixture.awayTeamName} - ${market}`)
                } else {
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
                fixtureGeneratedPick = true
              } // end else (not duplicate)
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
                // Check if pick already exists for this fixture+market
                const alreadyExists = await this.pickExists(fixture.fixtureId, MarketType.OVER_45_CORNERS_1H)
                if (alreadyExists) {
                  this.logger.debug(`Skip duplicate: ${fixture.homeTeamName} vs ${fixture.awayTeamName} - OVER_45_CORNERS_1H`)
                } else {
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
                fixtureGeneratedPick = true
              } // end else (not duplicate)
              }
            }
          }

          // ============================================================
          // Asian Corners Handicap
          // DISABLED: Bet365 offers different lines than our model calculates.
          // Our model calculates -2.5 but Bet365 only offers -1.0.
          // Need to implement line validation before re-enabling.
          // ============================================================
          const handicapOdds = null // DISABLED: this.findCornersHandicapOdds(odds)
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
              // Check if pick already exists for this fixture+market
              const alreadyExists = await this.pickExists(fixture.fixtureId, MarketType.CORNERS_HANDICAP)
              if (alreadyExists) {
                this.logger.debug(`Skip duplicate: ${fixture.homeTeamName} vs ${fixture.awayTeamName} - ASIAN_CORNERS_HANDICAP`)
              } else {
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
              fixtureGeneratedPick = true
              } // end else (not duplicate)
            }
          }
        }

        // ====================================================================
        // CARDS VALUE DETECTION
        // ====================================================================
        const cardsResult = this.scoringCardsService.scoreCards(
          fixture,
          teamAStats,
          teamBStats,
          h2h,
          league.apiFootballId
        )

        this.logger.debug(
          `Cards scoring: expected=${cardsResult.cardsExpected.toFixed(1)}, ` +
            `1H=${cardsResult.cardsExpected1H.toFixed(1)}, quality=${cardsResult.dataQuality}`
        )

        // Detect value for cards
        // API-Football uses .5 lines (4.5, 5.5) in the main "Cards Over/Under" market
        // Note: The main market typically doesn't have 3.5, but we try anyway
        if (cardsResult.cardsExpected > 0 && odds) {
          const cardLines = [4.5, 5.5] // Main market lines (removed 3.5 - not in main market)
          const timeWindow = this.determineTimeWindow(new Date(fixture.kickoff))

          for (const line of cardLines) {
            const cardsOdds = this.findCardsOdds(odds, line)

            if (cardsOdds) {
              // API already uses .5 format, so actualLine is ready to use
              const effectiveLine = cardsOdds.actualLine

              this.logger.debug(
                `Cards odds matched: line=${line}, odds=${cardsOdds.over}/${cardsOdds.under}`
              )

              const edgeResult = this.scoringCardsService.calculateEdge(
                cardsResult,
                effectiveLine,
                cardsOdds.over,
                cardsOdds.under
              )

              if (edgeResult.direction !== 'SKIP' && edgeResult.edge >= 0.05) {
                // FILTER: Minimum odds for cards (same as corners)
                const MIN_ODDS_CARDS = 1.40
                if (edgeResult.selectedOdds < MIN_ODDS_CARDS) {
                  this.logger.debug(
                    `Skip cards ${fixture.homeTeamName} vs ${fixture.awayTeamName}: odds ${edgeResult.selectedOdds} < ${MIN_ODDS_CARDS}`
                  )
                  continue
                }

                // FILTER: Minimum stars (exclude weak picks)
                const MIN_STARS = 3
                const stars = this.calculateStars(edgeResult.edge)
                if (stars < MIN_STARS) {
                  this.logger.debug(
                    `Skip cards ${fixture.homeTeamName} vs ${fixture.awayTeamName}: ${stars} stars < ${MIN_STARS} required`
                  )
                  continue
                }

                // FILTER: Minimum sample size for cards
                const MIN_GAMES_CARDS = 8
                if (teamAStats.gamesPlayed < MIN_GAMES_CARDS || teamBStats.gamesPlayed < MIN_GAMES_CARDS) {
                  this.logger.debug(
                    `Skip cards ${fixture.homeTeamName} vs ${fixture.awayTeamName}: insufficient data ` +
                    `(${teamAStats.gamesPlayed}+${teamBStats.gamesPlayed} games, need ${MIN_GAMES_CARDS}+ each)`
                  )
                  continue
                }

                const market = this.getCardsMarketType(effectiveLine, edgeResult.direction)
                const probOwn = this.scoringCardsService.getProbabilityForLine(
                  cardsResult,
                  effectiveLine,
                  edgeResult.direction
                )
                const probImplied = 1 / edgeResult.selectedOdds

                // Check if pick already exists for this fixture+market
                const alreadyExists = await this.pickExists(fixture.fixtureId, market)
                if (alreadyExists) {
                  this.logger.debug(`Skip duplicate: ${fixture.homeTeamName} vs ${fixture.awayTeamName} - ${market}`)
                } else {
                picks.push({
                  leg: {
                    fixtureId: fixture.fixtureId,
                    leagueId: league.apiFootballId,
                    homeTeam: fixture.homeTeamName,
                    awayTeam: fixture.awayTeamName,
                    market,
                    direction: edgeResult.direction,
                    line: effectiveLine,
                    odds: edgeResult.selectedOdds,
                    probOwn,
                    edge: edgeResult.edge,
                    confidenceScore: Math.min(100, Math.round(edgeResult.edge * 500 + 40)),
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
                      edgeResult.direction === 'OVER'
                        ? MarketDirection.OVER
                        : MarketDirection.UNDER,
                    line: effectiveLine,
                    probOwn,
                    probImplied,
                    edge: edgeResult.edge,
                    confidenceScore: Math.min(100, Math.round(edgeResult.edge * 500 + 40)),
                    oddsAtDetection: edgeResult.selectedOdds,
                    bestBookmaker: 'API-Football',
                    status: PickStatus.PENDING,
                    stars: this.calculateStars(edgeResult.edge),
                    reasons: this.generateCardsReasons(
                      effectiveLine,
                      edgeResult.direction,
                      teamAStats,
                      teamBStats,
                      cardsResult
                    ),
                    modelInputs: {
                      dataSource: 'API-Football',
                      contextFlags: context.flags,
                      cardsExpected: cardsResult.cardsExpected,
                      teamAStats: {
                        name: fixture.homeTeamName,
                        avgCardsTotal: teamAStats.avg_cards_total,
                        homeCardsTotal: teamAStats.home_cards_total,
                        formCards5: teamAStats.form_cards_5,
                        gamesPlayed: teamAStats.gamesPlayed,
                      },
                      teamBStats: {
                        name: fixture.awayTeamName,
                        avgCardsTotal: teamBStats.avg_cards_total,
                        awayCardsTotal: teamBStats.away_cards_total,
                        formCards5: teamBStats.form_cards_5,
                        gamesPlayed: teamBStats.gamesPlayed,
                      },
                      calculationExplanation: `Tarjetas esperadas: ${cardsResult.cardsExpected.toFixed(1)} (Local: ${cardsResult.cardsAExpected.toFixed(1)} + Visitante: ${cardsResult.cardsBExpected.toFixed(1)}). Línea: Over ${effectiveLine}. Basado en promedios de ${teamAStats.gamesPlayed} y ${teamBStats.gamesPlayed} partidos.`,
                      ...this.getWeatherFields(weather, context),
                    },
                  },
                })
                fixtureGeneratedPick = true
                this.logger.log(
                  `🟨 Cards pick: ${fixture.homeTeamName} vs ${fixture.awayTeamName} ` +
                  `${edgeResult.direction} ${effectiveLine} @${edgeResult.selectedOdds.toFixed(2)} ` +
                  `(edge: ${(edgeResult.edge * 100).toFixed(1)}%)`
                )
              } // end else (not duplicate)
              }
            }
          }

          // First half cards (1.5 line)
          const cards1HOdds = this.findCardsOdds(odds, 1.5, true)
          if (cards1HOdds) {
            // API already uses .5 format
            const effectiveLine1H = cards1HOdds.actualLine

            this.logger.debug(
              `Cards 1H odds matched: line=1.5, odds=${cards1HOdds.over}/${cards1HOdds.under}`
            )

            const edge1HResult = this.scoringCardsService.calculateEdge1H(
              cardsResult,
              effectiveLine1H,
              cards1HOdds.over,
              cards1HOdds.under
            )

            if (edge1HResult.direction !== 'SKIP' && edge1HResult.edge >= 0.05) {
              const MIN_ODDS_CARDS = 1.40
              if (edge1HResult.selectedOdds >= MIN_ODDS_CARDS) {
                const market = MarketType.OVER_15_CARDS_1H
                const probOwn1H = cardsResult.prob1HByLine.get(effectiveLine1H)?.[edge1HResult.direction === 'OVER' ? 'over' : 'under'] || 0
                const probImplied1H = 1 / edge1HResult.selectedOdds

                const alreadyExists = await this.pickExists(fixture.fixtureId, market)
                if (!alreadyExists) {
                  picks.push({
                    leg: {
                      fixtureId: fixture.fixtureId,
                      leagueId: league.apiFootballId,
                      homeTeam: fixture.homeTeamName,
                      awayTeam: fixture.awayTeamName,
                      market,
                      direction: edge1HResult.direction,
                      line: effectiveLine1H,
                      odds: edge1HResult.selectedOdds,
                      probOwn: probOwn1H,
                      edge: edge1HResult.edge,
                      confidenceScore: Math.min(100, Math.round(edge1HResult.edge * 500 + 40)),
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
                      teamHome: { id: fixture.homeTeamId, name: fixture.homeTeamName },
                      teamAway: { id: fixture.awayTeamId, name: fixture.awayTeamName },
                      kickoff: new Date(fixture.kickoff),
                      timeWindow,
                      market,
                      direction:
                        edge1HResult.direction === 'OVER'
                          ? MarketDirection.OVER
                          : MarketDirection.UNDER,
                      line: effectiveLine1H,
                      probOwn: probOwn1H,
                      probImplied: probImplied1H,
                      edge: edge1HResult.edge,
                      confidenceScore: Math.min(100, Math.round(edge1HResult.edge * 500 + 40)),
                      oddsAtDetection: edge1HResult.selectedOdds,
                      bestBookmaker: 'API-Football',
                      status: PickStatus.PENDING,
                      stars: this.calculateStars(edge1HResult.edge),
                      reasons: [
                        `Tarjetas 1H esperadas: ${cardsResult.cardsExpected1H.toFixed(1)}`,
                        `~38% de tarjetas caen en primera mitad`,
                      ],
                      modelInputs: {
                        dataSource: 'API-Football',
                        contextFlags: context.flags,
                        cardsExpected1H: cardsResult.cardsExpected1H,
                        cardsExpected: cardsResult.cardsExpected,
                        calculationExplanation: `Tarjetas 1H esperadas: ${cardsResult.cardsExpected1H.toFixed(1)} (38% del total ${cardsResult.cardsExpected.toFixed(1)}). Línea: Over ${effectiveLine1H}.`,
                        ...this.getWeatherFields(weather, context),
                      },
                    },
                  })
                  fixtureGeneratedPick = true
                  this.logger.log(
                    `🟨 Cards 1H pick: ${fixture.homeTeamName} vs ${fixture.awayTeamName} ` +
                    `${edge1HResult.direction} ${effectiveLine1H} @${edge1HResult.selectedOdds.toFixed(2)} ` +
                    `(edge: ${(edge1HResult.edge * 100).toFixed(1)}%)`
                  )
                }
              }
            }
          }
        }

        // ====================================================================
        // SMART SCANNING: Mark fixture as analyzed
        // ====================================================================
        await this.markAsAnalyzed(
          fixture,
          date,
          league.apiFootballId,
          fixtureGeneratedPick
        )
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
   * Find BTTS 1H (Both Teams To Score in First Half) odds
   */
  private findBTTS1HOdds(odds: any): number | null {
    if (!odds?.bookmakers) return null

    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        const marketName = market.marketName.toLowerCase()

        // Look for BTTS 1H / Both Teams Score First Half market
        const isBTTS1H =
          (marketName.includes('both') && marketName.includes('score') && marketName.includes('half')) ||
          (marketName.includes('btts') && marketName.includes('1h')) ||
          (marketName.includes('btts') && marketName.includes('first')) ||
          (marketName.includes('gg') && marketName.includes('1h'))

        if (isBTTS1H) {
          for (const value of market.values) {
            const valueName = value.name.toLowerCase()
            // Look for "Yes" or "Si" value
            if (valueName === 'yes' || valueName === 'si' || valueName === 'sí') {
              return value.odds
            }
          }
        }
      }
    }

    return null
  }

  /**
   * Find cards odds for a specific line
   *
   * IMPORTANT: API-Football returns multiple cards markets:
   * - "Cards Over/Under" - main market (WE WANT THIS)
   * - "Cards Asian Handicap" - handicap market (skip)
   * - "Home Team Total Cards" - team-specific (skip)
   * - "Away Team Total Cards" - team-specific (skip)
   *
   * We must ONLY use the main "Cards Over/Under" market to get
   * accurate odds for total cards in the match.
   */
  private findCardsOdds(
    odds: any,
    line: number,
    isFirstHalf = false
  ): { over: number; under: number; actualLine: number } | null {
    if (!odds?.bookmakers) return null

    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        const marketName = market.marketName.toLowerCase()

        // IMPORTANT: Only match the main "Cards Over/Under" market
        // Skip team-specific markets (Home/Away Team Cards) and handicaps
        const isMainCardsOverUnder =
          (marketName.includes('cards over') || marketName.includes('card over')) ||
          (marketName === 'cards over/under') ||
          ((marketName.includes('card') || marketName.includes('booking')) &&
           marketName.includes('over') &&
           marketName.includes('under') &&
           !marketName.includes('home') &&
           !marketName.includes('away') &&
           !marketName.includes('team') &&
           !marketName.includes('handicap') &&
           !marketName.includes('asian'))

        const is1HMarket = marketName.includes('half') || marketName.includes('1h')

        // Match the right market type
        if (isMainCardsOverUnder && (isFirstHalf ? is1HMarket : !is1HMarket)) {
          let overOdds = 0
          let underOdds = 0
          let foundLine = 0

          for (const value of market.values) {
            const linePart = value.name.match(/[\d.]+/)
            if (!linePart) continue

            const parsedLine = parseFloat(linePart[0])

            // API uses same .5 format as us (4.5, 5.5), so direct match
            if (parsedLine === line) {
              if (value.name.toLowerCase().includes('over')) {
                overOdds = value.odds
                foundLine = parsedLine
              } else if (value.name.toLowerCase().includes('under')) {
                underOdds = value.odds
              }
            }
          }

          if (overOdds > 0 && underOdds > 0) {
            this.logger.debug(
              `Cards odds found: line=${line}, found=${foundLine}, over=${overOdds}, under=${underOdds}, market=${market.marketName}`
            )
            return { over: overOdds, under: underOdds, actualLine: foundLine }
          }
        }
      }
    }

    return null
  }

  /**
   * Get the appropriate MarketType for cards based on line and direction
   */
  private getCardsMarketType(
    line: number,
    direction: 'OVER' | 'UNDER'
  ): MarketType {
    if (direction === 'OVER') {
      switch (line) {
        case 2.5:
          return MarketType.OVER_25_CARDS
        case 3.5:
          return MarketType.OVER_35_CARDS
        case 4.5:
          return MarketType.OVER_45_CARDS
        case 5.5:
          return MarketType.OVER_55_CARDS
        default:
          return MarketType.OVER_35_CARDS
      }
    } else {
      switch (line) {
        case 3.5:
          return MarketType.UNDER_35_CARDS
        case 4.5:
          return MarketType.UNDER_45_CARDS
        case 5.5:
          return MarketType.UNDER_55_CARDS
        default:
          return MarketType.UNDER_45_CARDS
      }
    }
  }

  /**
   * Generate human-readable reasons for a cards pick
   */
  private generateCardsReasons(
    line: number,
    direction: 'OVER' | 'UNDER',
    teamAStats: any,
    teamBStats: any,
    cardsResult: any
  ): string[] {
    const reasons: string[] = []

    // Expected cards
    reasons.push(`Tarjetas esperadas: ${cardsResult.cardsExpected.toFixed(1)}`)

    // Team card averages
    if (teamAStats?.avg_cards_total >= 2) {
      reasons.push(`Local recibe ${teamAStats.avg_cards_total.toFixed(1)} tarjetas/partido`)
    }
    if (teamBStats?.avg_cards_total >= 2) {
      reasons.push(`Visitante recibe ${teamBStats.avg_cards_total.toFixed(1)} tarjetas/partido`)
    }

    // Form cards
    const avgFormCards = (teamAStats?.form_cards_5 || 0) + (teamBStats?.form_cards_5 || 0)
    if (avgFormCards > cardsResult.cardsExpected) {
      reasons.push(`Tendencia reciente: ${avgFormCards.toFixed(1)} tarjetas/partido`)
    }

    // Direction explanation
    if (direction === 'OVER' && cardsResult.cardsExpected > line) {
      reasons.push(`Modelo sugiere ${direction} ${line} tarjetas`)
    } else if (direction === 'UNDER' && cardsResult.cardsExpected < line) {
      reasons.push(`Modelo sugiere ${direction} ${line} tarjetas`)
    }

    return reasons.slice(0, 3)
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
   * Get user's timezone from settings
   * Falls back to America/El_Salvador if not configured
   */
  private async getUserTimezone(): Promise<string> {
    const settings = await this.bettingSettingsModel.findOne().exec()
    return settings?.timezone || 'America/El_Salvador'
  }

  /**
   * Get tomorrow's date string in user's timezone (from settings)
   */
  private async getTomorrowDateStringAsync(): Promise<string> {
    const timezone = await this.getUserTimezone()
    return this.calculateTomorrowDate(timezone)
  }

  /**
   * Get tomorrow's date string (sync version with explicit timezone)
   */
  private getTomorrowDateString(timezone: string = 'America/El_Salvador'): string {
    return this.calculateTomorrowDate(timezone)
  }

  /**
   * Calculate tomorrow's date in a specific timezone
   */
  private calculateTomorrowDate(timezone: string): string {
    const now = new Date()
    const localTime = new Date(
      now.toLocaleString('en-US', { timeZone: timezone })
    )
    // Add 1 day
    localTime.setDate(localTime.getDate() + 1)
    // Format as YYYY-MM-DD
    const year = localTime.getFullYear()
    const month = String(localTime.getMonth() + 1).padStart(2, '0')
    const day = String(localTime.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * Convert a local date string to UTC date range for database queries
   *
   * Example for "2026-03-28" in El Salvador (UTC-6):
   *   Start: 2026-03-28 00:00 local = 2026-03-28 06:00 UTC
   *   End: 2026-03-28 23:59 local = 2026-03-29 05:59 UTC
   *
   * This ensures that queries by kickoff time correctly match local dates
   */
  private getLocalDateRangeInUTC(localDate: string, timezone: string): { start: Date; end: Date } {
    // Create start and end of day in local timezone, then convert to UTC
    // Use Intl.DateTimeFormat to get the UTC offset for this timezone
    const startLocal = new Date(`${localDate}T00:00:00`)
    const endLocal = new Date(`${localDate}T23:59:59.999`)

    // Get the offset by comparing local interpretation vs UTC
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })

    // Parse the local date in the target timezone
    // Create a reference date at midnight local time
    const refDate = new Date(`${localDate}T12:00:00Z`) // Noon UTC to avoid DST edge cases
    const parts = formatter.formatToParts(refDate)

    const refHour = parseInt(parts.find(p => p.type === 'hour')?.value || '12')
    const offsetHours = refHour - 12 // Difference from UTC

    // Calculate UTC times
    // For El Salvador (UTC-6): offsetHours = 6 (local is 6 hours behind UTC)
    // So midnight local = 06:00 UTC
    const startUTC = new Date(`${localDate}T00:00:00Z`)
    startUTC.setHours(startUTC.getHours() - offsetHours)

    const endUTC = new Date(`${localDate}T23:59:59.999Z`)
    endUTC.setHours(endUTC.getHours() - offsetHours)

    this.logger.debug(
      `Local date ${localDate} (${timezone}) -> UTC range: ${startUTC.toISOString()} to ${endUTC.toISOString()}`
    )

    return { start: startUTC, end: endUTC }
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
