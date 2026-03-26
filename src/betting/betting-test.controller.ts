import { Controller, Get, Query } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ConfigService } from '@nestjs/config'
import { Model } from 'mongoose'
import { RedisCacheService } from '../common/redis-cache.service'
import { NightlyAnalysisCron } from './cron/nightly-analysis.cron'
import { PreMatchCheckCron } from './cron/pre-match-check.cron'
import { OddsMonitorCron } from './cron/odds-monitor.cron'
import { ResultCollectorCron } from './cron/result-collector.cron'
import { ApiFootballBettingService } from './services/api-football-betting.service'
import { OddsApiService } from './services/odds-api.service'
import { ScoringGoalsService } from './services/scoring-goals.service'
import { ValueDetectionService } from './services/value-detection.service'
import { BettingTelegramService } from './telegram/betting-telegram.service'
import { BettingLeague, BettingLeagueDocument } from './schemas/betting-league.schema'
import { BettingPick, BettingPickDocument } from './schemas/betting-pick.schema'
import { BettingCombo, BettingComboDocument } from './schemas/betting-combo.schema'
import { BettingSettings, BettingSettingsDocument } from './schemas/betting-settings.schema'
import { AnalyzedFixture, AnalyzedFixtureDocument } from './schemas/analyzed-fixture.schema'
import { MarketType, MarketDirection, PickStatus } from './enums/betting.enums'

/**
 * Test endpoints for betting module
 * NOTE: These endpoints are for development/testing only
 * Remove or protect with auth in production
 */
@Controller('betting/test')
export class BettingTestController {
  constructor(
    private nightlyAnalysis: NightlyAnalysisCron,
    private preMatchCheck: PreMatchCheckCron,
    private oddsMonitor: OddsMonitorCron,
    private resultCollector: ResultCollectorCron,
    private apiFootball: ApiFootballBettingService,
    private oddsApi: OddsApiService,
    private scoringGoals: ScoringGoalsService,
    private valueDetection: ValueDetectionService,
    private telegramService: BettingTelegramService,
    private configService: ConfigService,
    private redisCache: RedisCacheService,
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    @InjectModel(AnalyzedFixture.name)
    private analyzedFixtureModel: Model<AnalyzedFixtureDocument>
  ) {}

  /**
   * Trigger manual nightly analysis scan
   * GET /betting/test/scan?date=2026-04-07&dryRun=true
   *
   * dryRun=true: Uses existing picks from DB, no API calls
   */
  @Get('scan')
  async triggerScan(
    @Query('date') date?: string,
    @Query('dryRun') dryRun?: string
  ) {
    // Dry run mode - just return existing picks without API calls
    if (dryRun === 'true') {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      const dayAfter = new Date(tomorrow)
      dayAfter.setDate(dayAfter.getDate() + 1)

      const picks = await this.bettingPickModel
        .find({ kickoff: { $gte: tomorrow, $lt: dayAfter } })
        .exec()
      const combos = await this.bettingComboModel
        .find({ 'legs.kickoff': { $gte: tomorrow, $lt: dayAfter } })
        .exec()

      return {
        success: true,
        message: 'Dry run - using existing data (no API calls)',
        date: date || 'tomorrow',
        picks: picks.length,
        combos: combos.length,
        dryRun: true,
      }
    }

    const result = await this.nightlyAnalysis.triggerManualAnalysis(date)
    return {
      success: true,
      message: 'Scan completed',
      date: date || 'tomorrow',
      ...result,
    }
  }

  /**
   * Trigger pre-match check
   * GET /betting/test/pre-match
   */
  @Get('pre-match')
  async triggerPreMatch() {
    const result = await this.preMatchCheck.triggerManualCheck()
    return {
      success: true,
      message: 'Pre-match check completed',
      ...result,
    }
  }

  /**
   * Trigger odds monitoring
   * GET /betting/test/odds-monitor
   */
  @Get('odds-monitor')
  async triggerOddsMonitor() {
    const result = await this.oddsMonitor.triggerManualMonitor()
    return {
      success: true,
      message: 'Odds monitor completed',
      ...result,
    }
  }

  /**
   * Trigger result collection
   * GET /betting/test/collect-results
   */
  @Get('collect-results')
  async triggerResultCollection() {
    const result = await this.resultCollector.triggerManualCollection()
    return {
      success: true,
      message: 'Result collection completed',
      ...result,
    }
  }

  /**
   * Health check for betting module
   * GET /betting/test/health
   */
  @Get('health')
  health() {
    return {
      status: 'ok',
      module: 'betting',
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Get current betting settings
   * GET /betting/test/settings
   */
  @Get('settings')
  async getSettings() {
    const settings = await this.bettingSettingsModel.findOne().exec()
    if (!settings) {
      return { error: 'No settings found' }
    }
    return {
      adminId: settings.adminId,
      bankroll: settings.bankroll,
      isActive: settings.isActive,
      stakes: {
        fixedStake: settings.stakes?.fixedStake,
        useFixedStake: settings.stakes?.useFixedStake,
        kellyFraction: settings.stakes?.kellyFraction,
        maxStakeIndividualPct: settings.stakes?.maxStakeIndividualPct,
        maxStakeComboPct: settings.stakes?.maxStakeComboPct,
        maxDailyExposurePct: settings.stakes?.maxDailyExposurePct,
        maxPicksPerDay: settings.stakes?.maxPicksPerDay,
        maxCombosPerDay: settings.stakes?.maxCombosPerDay,
      },
      unitValue: settings.stakes?.fixedStake || 10,
      telegramAlertsOn: settings.telegramAlertsOn,
    }
  }

  /**
   * Delete picks by date
   * GET /betting/test/delete-picks?date=2026-03-24
   */
  @Get('delete-picks')
  async deletePicks(@Query('date') date: string) {
    if (!date) {
      return { error: 'Date required (format: YYYY-MM-DD)' }
    }

    // Use UTC dates to avoid timezone issues
    const startOfDay = new Date(`${date}T00:00:00.000Z`)
    const endOfDay = new Date(`${date}T23:59:59.999Z`)

    // Delete picks for this date
    const picksResult = await this.bettingPickModel.deleteMany({
      kickoff: { $gte: startOfDay, $lte: endOfDay }
    })

    // Delete combos created for this date
    const combosResult = await this.bettingComboModel.deleteMany({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    })

    // Delete analyzed fixtures cache for this date (allows re-scan)
    const analyzedResult = await this.analyzedFixtureModel.deleteMany({
      date: date
    })

    return {
      success: true,
      date,
      picksDeleted: picksResult.deletedCount,
      combosDeleted: combosResult.deletedCount,
      analyzedFixturesCleared: analyzedResult.deletedCount,
    }
  }

  /**
   * Update pick result manually (for testing/tracking)
   * GET /betting/test/update-pick?id=XXX&status=WON&betPlaced=true
   * GET /betting/test/update-pick?id=XXX&status=LOST&betPlaced=true
   */
  @Get('update-pick')
  async updatePick(
    @Query('id') pickId: string,
    @Query('status') status?: 'WON' | 'LOST' | 'VOID',
    @Query('betPlaced') betPlaced?: string,
    @Query('scoreHT') scoreHT?: string,
  ) {
    if (!pickId) {
      return { error: 'Pick ID required' }
    }

    const pick = await this.bettingPickModel.findById(pickId).exec()
    if (!pick) {
      return { error: 'Pick not found', pickId }
    }

    const updateData: any = {}

    // Update status
    if (status) {
      updateData.status = status

      // Calculate profit if WON
      if (status === 'WON' && pick.stake && pick.oddsAtDetection) {
        updateData.profit = pick.stake * (pick.oddsAtDetection - 1)
      } else if (status === 'LOST') {
        updateData.profit = -(pick.stake || 0)
      } else if (status === 'VOID') {
        updateData.profit = 0
      }
    }

    // Update bet placed
    if (betPlaced === 'true') {
      updateData.betPlaced = true
      updateData.betPlacedAt = new Date()
    }

    // Update score
    if (scoreHT) {
      updateData['matchResult.scoreHT'] = scoreHT
    }

    const updated = await this.bettingPickModel.findByIdAndUpdate(
      pickId,
      { $set: updateData },
      { new: true }
    ).exec()

    return {
      success: true,
      pick: {
        id: updated._id,
        match: `${updated.teamHome.name} vs ${updated.teamAway.name}`,
        market: updated.market,
        status: updated.status,
        betPlaced: updated.betPlaced,
        stake: updated.stake,
        profit: updated.profit,
        scoreHT: updated.matchResult?.scoreHT,
      }
    }
  }

  /**
   * Get picks by date with full details
   * GET /betting/test/tomorrow-picks
   * GET /betting/test/tomorrow-picks?date=2026-03-26
   */
  @Get('tomorrow-picks')
  async getTomorrowPicks(@Query('date') date?: string) {
    let targetDate: Date
    if (date) {
      targetDate = new Date(`${date}T00:00:00.000Z`)
    } else {
      targetDate = new Date()
      targetDate.setDate(targetDate.getDate() + 1)
      targetDate.setHours(0, 0, 0, 0)
    }
    const dayAfter = new Date(targetDate)
    dayAfter.setDate(dayAfter.getDate() + 1)

    const picks = await this.bettingPickModel
      .find({ kickoff: { $gte: targetDate, $lt: dayAfter } })
      .sort({ confidenceScore: -1 })
      .exec()

    const combos = await this.bettingComboModel
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ score: -1 })
      .exec()

    return {
      date: targetDate.toISOString().split('T')[0],
      picksCount: picks.length,
      combosCount: combos.length,
      picks: picks.map(p => ({
        match: `${p.teamHome.name} vs ${p.teamAway.name}`,
        league: p.league.name,
        market: p.market,
        odds: p.oddsAtDetection?.toFixed(2),
        edge: `${(p.edge * 100).toFixed(1)}%`,
        prob: `${(p.probOwn * 100).toFixed(0)}%`,
        score: p.confidenceScore,
        stars: p.stars,
        stake: p.stake?.toFixed(2),
        kickoff: p.kickoff,
        reasons: p.reasons,
        modelInputs: p.modelInputs ? {
          expectedGoals1H: p.modelInputs.expectedGoals1H?.toFixed(2),
          teamA: p.modelInputs.teamAStats ? {
            avgGoals1H: p.modelInputs.teamAStats.avgGoals1H?.toFixed(2),
            avgConceded1H: p.modelInputs.teamAStats.avgConceded1H?.toFixed(2),
            over05_1h_pct: p.modelInputs.teamAStats.over05_1h_pct ? `${(p.modelInputs.teamAStats.over05_1h_pct * 100).toFixed(0)}%` : null,
            games: p.modelInputs.teamAStats.gamesPlayed,
          } : null,
          teamB: p.modelInputs.teamBStats ? {
            avgGoals1H: p.modelInputs.teamBStats.avgGoals1H?.toFixed(2),
            avgConceded1H: p.modelInputs.teamBStats.avgConceded1H?.toFixed(2),
            over05_1h_pct: p.modelInputs.teamBStats.over05_1h_pct ? `${(p.modelInputs.teamBStats.over05_1h_pct * 100).toFixed(0)}%` : null,
            games: p.modelInputs.teamBStats.gamesPlayed,
          } : null,
        } : null,
      })),
      combos: combos.map(c => ({
        type: c.type,
        legs: c.legs?.length || 0,
        odds: c.combinedOdds?.toFixed(2),
        ev: `${((c.evReal || 0) * 100).toFixed(1)}%`,
        score: c.score,
        stake: c.stake?.toFixed(2),
      })),
    }
  }

  /**
   * Add a league by API-Football ID
   * GET /betting/test/add-league?id=10&tier=4&active=true
   */
  @Get('add-league')
  async addLeague(
    @Query('id') apiFootballId: string,
    @Query('tier') tier: string = '4',
    @Query('active') active: string = 'false'
  ) {
    const id = parseInt(apiFootballId)
    const tierNum = parseInt(tier)
    const isActive = active === 'true'

    // Check if exists
    const existing = await this.bettingLeagueModel.findOne({ apiFootballId: id }).exec()
    if (existing) {
      return { error: `League already exists: ${existing.name}`, id: existing.apiFootballId }
    }

    // Fetch info from API-Football
    const leagueInfo = await this.apiFootball.getLeagueInfo(id)
    if (!leagueInfo) {
      return { error: `League not found in API-Football`, id }
    }

    const seasonInfo = await this.apiFootball.getLeagueSeasonInfo(id)

    // Create league
    const newLeague = await this.bettingLeagueModel.create({
      apiFootballId: id,
      name: leagueInfo.name,
      country: leagueInfo.country || 'International',
      division: 1,
      tier: tierNum,
      isActive,
      logo: leagueInfo.logo,
      season: seasonInfo?.season?.toString(),
      seasonStart: seasonInfo?.seasonStart ? new Date(seasonInfo.seasonStart) : undefined,
      seasonEnd: seasonInfo?.seasonEnd ? new Date(seasonInfo.seasonEnd) : undefined,
      coverage: seasonInfo?.coverage ? {
        events: seasonInfo.coverage.fixtures?.events ?? false,
        lineups: seasonInfo.coverage.fixtures?.lineups ?? false,
        statisticsFixtures: seasonInfo.coverage.fixtures?.statistics_fixtures ?? false,
        statisticsPlayers: seasonInfo.coverage.fixtures?.statistics_players ?? false,
        standings: seasonInfo.coverage.standings ?? false,
        players: seasonInfo.coverage.players ?? false,
        topScorers: seasonInfo.coverage.top_scorers ?? false,
        predictions: seasonInfo.coverage.predictions ?? false,
        odds: seasonInfo.coverage.odds ?? false,
      } : undefined,
      stats: {},
      modelConfig: {},
      lastSynced: new Date(),
    })

    return {
      success: true,
      message: `League added: ${newLeague.name}`,
      league: {
        id: newLeague._id.toString(),
        apiFootballId: newLeague.apiFootballId,
        name: newLeague.name,
        country: newLeague.country,
        tier: newLeague.tier,
        isActive: newLeague.isActive,
        season: newLeague.season,
      },
    }
  }

  /**
   * Update league market strengths
   * GET /betting/test/update-league-markets?id=78&markets=goals_1h,over25,btts&notes=High%20scoring
   */
  @Get('update-league-markets')
  async updateLeagueMarkets(
    @Query('id') apiFootballId: string,
    @Query('markets') markets: string,
    @Query('notes') notes?: string
  ) {
    const id = parseInt(apiFootballId)
    if (isNaN(id)) {
      return { error: 'Invalid league ID' }
    }

    const marketStrengths = markets ? markets.split(',').map(m => m.trim()) : []

    const league = await this.bettingLeagueModel.findOneAndUpdate(
      { apiFootballId: id },
      {
        $set: {
          marketStrengths,
          ...(notes && { notes })
        }
      },
      { new: true }
    ).exec()

    if (!league) {
      return { error: 'League not found', id }
    }

    return {
      success: true,
      league: {
        id: league.apiFootballId,
        name: league.name,
        marketStrengths: league.marketStrengths,
        notes: league.notes,
      }
    }
  }

  /**
   * Update user timezone
   * GET /betting/test/set-timezone?tz=America/El_Salvador
   */
  @Get('set-timezone')
  async setTimezone(@Query('tz') timezone: string) {
    if (!timezone) {
      return { error: 'Missing timezone parameter. Example: ?tz=America/El_Salvador' }
    }

    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone })
    } catch {
      return { error: `Invalid timezone: ${timezone}. Use IANA format like America/New_York, UTC, etc.` }
    }

    const settings = await this.bettingSettingsModel.findOneAndUpdate(
      {},
      { $set: { timezone } },
      { new: true, upsert: true }
    ).exec()

    return {
      success: true,
      timezone: settings?.timezone,
      message: `Timezone updated to ${timezone}`,
    }
  }

  /**
   * Diagnostic endpoint to analyze a specific fixture
   * GET /betting/test/diagnose?fixtureId=1391110&leagueId=140
   */
  @Get('diagnose')
  async diagnoseFixture(
    @Query('fixtureId') fixtureId: string,
    @Query('leagueId') leagueId: string
  ) {
    try {
      const fId = parseInt(fixtureId)
      const lId = parseInt(leagueId)

      // Get team IDs from fixture
      const fixtures = await this.apiFootball.getFixtures('2026-04-04', lId, '2025')
      const fixture = fixtures.find((f) => f.fixtureId === fId)

      if (!fixture) {
        return { error: 'Fixture not found', fixtures: fixtures.map((f) => ({ id: f.fixtureId, match: `${f.homeTeamName} vs ${f.awayTeamName}` })) }
      }

      // Get team stats one by one for debugging
      const homeStats = await this.apiFootball.getTeamStats(lId, fixture.homeTeamId)
      if (!homeStats) {
        return { error: 'Home team stats not found', homeTeamId: fixture.homeTeamId }
      }

      const awayStats = await this.apiFootball.getTeamStats(lId, fixture.awayTeamId)
      if (!awayStats) {
        return { error: 'Away team stats not found', awayTeamId: fixture.awayTeamId }
      }

      const h2h = await this.apiFootball.getH2H(fixture.homeTeamId, fixture.awayTeamId)
      const odds = await this.apiFootball.getOdds(fId)

      // Score goals
      const goalsResult = this.scoringGoals.scoreGoals1H(
        fixture,
        homeStats,
        awayStats,
        h2h,
        4 // La Liga is tier 4
      )

      // Find Over 0.5 1H odds
      let over05Odds = 0
      if (odds?.bookmakers) {
        for (const bk of odds.bookmakers) {
          for (const market of bk.markets) {
            if (market.marketName.toLowerCase().includes('goals') && market.marketName.toLowerCase().includes('half')) {
              for (const v of market.values) {
                const valueName = String(v.name).toLowerCase()
                if (valueName.includes('over') && valueName.includes('0.5')) {
                  over05Odds = v.odds
                  break
                }
              }
            }
          }
        }
      }

      // Value detection
      let valueResult = null
      if (over05Odds > 1.0) {
        valueResult = this.valueDetection.detectValueGoals(goalsResult, 'over_05_1h', over05Odds, 'API-Football')
      }

      return {
        fixture: `${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
        fixtureId: fId,
        kickoff: fixture.kickoff,
        homeStats: {
          gamesPlayed: homeStats.gamesPlayed,
          home_over05_1h: homeStats.home_over05_1h,
          avg_goals_1h: homeStats.avg_goals_1h,
          form_goals_1h: homeStats.form_goals_1h,
        },
        awayStats: {
          gamesPlayed: awayStats.gamesPlayed,
          away_over05_1h: awayStats.away_over05_1h,
          avg_goals_1h: awayStats.avg_goals_1h,
          form_goals_1h: awayStats.form_goals_1h,
        },
        h2h: h2h ? { matches: h2h.matches, last_5_goals_1h: h2h.last_5_goals_1h } : null,
        goalsScoring: {
          probOver05_1H: goalsResult.probOver05_1H,
          probOver15_1H: goalsResult.probOver15_1H,
          expectedGoals1H: goalsResult.expectedGoals1H,
          warnings: goalsResult.warnings,
        },
        odds: {
          over05_1h: over05Odds,
          impliedProb: over05Odds > 0 ? 1 / over05Odds : 0,
        },
        valueDetection: valueResult,
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Test Telegram configuration
   * GET /betting/test/telegram
   */
  @Get('telegram')
  async testTelegram() {
    const adminChatId = this.configService.get<string>('ADMIN_TELEGRAM_ID')
    const botToken = this.configService.get<string>('BETTING_TELEGRAM_BOT_TOKEN')

    const config = {
      adminChatIdConfigured: !!adminChatId,
      adminChatIdValue: adminChatId ? `${adminChatId.slice(0, 3)}...${adminChatId.slice(-3)}` : null,
      adminChatIdLength: adminChatId?.length || 0,
      botTokenConfigured: !!botToken,
    }

    // Try to send a test message
    let messageSent = false
    let error = null

    try {
      await this.telegramService.sendMessage('🧪 *Test de Telegram*\n\nSi recibes este mensaje, la configuración está correcta!')
      messageSent = true
    } catch (e) {
      error = String(e)
    }

    return {
      config,
      messageSent,
      error,
      instructions: !adminChatId ? [
        '1. Busca @userinfobot en Telegram',
        '2. Envíale cualquier mensaje',
        '3. Copia el ID que te da',
        '4. Ponlo en ADMIN_TELEGRAM_ID en tu .env',
        '5. Reinicia el servidor',
      ] : messageSent ? [
        '✅ Telegram configurado correctamente!',
      ] : [
        '⚠️ Revisa que hayas iniciado conversación con el bot (/start)',
        '⚠️ Verifica que el ADMIN_TELEGRAM_ID sea tu ID personal, no el del bot',
      ],
    }
  }

  /**
   * Send nightly analysis alert with actual picks
   * GET /betting/test/send-nightly-alert
   * GET /betting/test/send-nightly-alert?date=2026-03-26
   */
  @Get('send-nightly-alert')
  async sendNightlyAlert(@Query('date') date?: string) {
    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings) {
        return { error: 'No settings found' }
      }

      // Use provided date or default to tomorrow
      let targetDate: Date
      if (date) {
        targetDate = new Date(`${date}T00:00:00.000Z`)
      } else {
        targetDate = new Date()
        targetDate.setDate(targetDate.getDate() + 1)
        targetDate.setHours(0, 0, 0, 0)
      }
      const dayAfter = new Date(targetDate)
      dayAfter.setDate(dayAfter.getDate() + 1)

      // Get picks for target date
      const picks = await this.bettingPickModel
        .find({
          kickoff: { $gte: targetDate, $lt: dayAfter },
        })
        .sort({ confidenceScore: -1 })
        .exec()

      // Get combos for target date
      const combos = await this.bettingComboModel
        .find({
          'legs.kickoff': { $gte: targetDate, $lt: dayAfter },
        })
        .exec()

      if (picks.length === 0 && combos.length === 0) {
        return { error: 'No picks or combos for date', date: targetDate.toISOString().split('T')[0] }
      }

      const totalExposure = picks.reduce((sum, p) => sum + (p.stake || 0), 0) +
        combos.reduce((sum, c) => sum + (c.stake || 0), 0)

      await this.telegramService.sendNightlyAnalysisAlert(
        targetDate,
        picks,
        combos,
        picks.length,  // fixturesAnalyzed
        32,            // leaguesAnalyzed
        'initial',     // alertType
        picks.length,  // totalPicks
        combos.length  // totalCombos
      )

      return {
        success: true,
        message: 'Nightly analysis alert sent',
        date: targetDate.toISOString().split('T')[0],
        picks: picks.length,
        combos: combos.length,
        totalExposure,
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Get available bookmakers for a fixture
   * GET /betting/test/bookmakers?fixtureId=1391116
   *
   * Note: This endpoint makes API calls. Use existing picks data instead
   * when possible to save quota.
   */
  @Get('bookmakers')
  async getBookmakers(@Query('fixtureId') fixtureId: string) {
    try {
      const fId = parseInt(fixtureId)
      if (!fId) {
        return { error: 'fixtureId required', tip: 'Use /tomorrow-picks to see existing data without API calls' }
      }
      const odds = await this.apiFootball.getOdds(fId)

      if (!odds || !odds.bookmakers) {
        return { error: 'No odds data available', fixtureId: fId }
      }

      // Extract bookmaker names and their markets
      const bookmakers = odds.bookmakers.map(bk => ({
        id: bk.bookmakerId,
        name: bk.bookmakerName,
        markets: bk.markets.map(m => m.marketName),
      }))

      // Check if Bet365 is available
      const bet365 = odds.bookmakers.find(
        bk => bk.bookmakerName.toLowerCase().includes('bet365')
      )

      // Get Over 0.5 1H odds from each bookmaker
      const over05OddsByBookmaker = odds.bookmakers
        .map(bk => {
          for (const market of bk.markets) {
            if (
              market.marketName.toLowerCase().includes('goals') &&
              market.marketName.toLowerCase().includes('half')
            ) {
              for (const v of market.values) {
                const valueName = String(v.name).toLowerCase()
                if (valueName.includes('over') && valueName.includes('0.5')) {
                  return {
                    bookmaker: bk.bookmakerName,
                    odds: v.odds,
                  }
                }
              }
            }
          }
          return null
        })
        .filter(Boolean)

      return {
        fixtureId: fId,
        totalBookmakers: bookmakers.length,
        bet365Available: !!bet365,
        bookmakers: bookmakers.map(b => b.name),
        over05_1h_odds: over05OddsByBookmaker,
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Send a test pick alert with APOSTÉ button
   * GET /betting/test/send-pick-alert?pickId=optional
   * If no pickId provided, sends a mock pick
   */
  @Get('send-pick-alert')
  async sendPickAlert(@Query('pickId') pickId?: string) {
    try {
      let pick: BettingPickDocument | null = null

      if (pickId) {
        pick = await this.bettingPickModel.findById(pickId).exec()
        if (!pick) {
          return { error: 'Pick not found', pickId }
        }
      } else {
        // Get the most recent pending pick, or create a mock one
        pick = await this.bettingPickModel
          .findOne({ status: 'pending' })
          .sort({ createdAt: -1 })
          .exec()

        if (!pick) {
          // Create a mock pick for testing
          const mockPick = {
            _id: 'test-pick-id',
            teamHome: { name: 'Real Madrid', id: 541 },
            teamAway: { name: 'Barcelona', id: 529 },
            league: { name: 'La Liga', id: 140 },
            market: 'Over 0.5 Goles 1H',
            direction: 'Over',
            line: '0.5',
            oddsAtDetection: 1.45,
            oddsAtBet: 1.45,
            stake: 3.15,
            confidenceScore: 85,
            stars: 4,
            reasons: [
              'Local marca en 1H en 90% de partidos',
              'Promedio 1.5 goles en 1H',
              'Visitante concede en 1H en 85% de partidos'
            ],
            kickoff: new Date(Date.now() + 3600000), // 1 hour from now
            betPlaced: false,
          } as unknown as BettingPickDocument

          await this.telegramService.sendPickWithBetButton(mockPick)
          return {
            success: true,
            message: 'Mock pick alert sent',
            pick: {
              match: 'Real Madrid vs Barcelona',
              market: mockPick.market,
              odds: mockPick.oddsAtDetection,
            },
          }
        }
      }

      await this.telegramService.sendPickWithBetButton(pick)
      return {
        success: true,
        message: 'Pick alert sent',
        pick: {
          id: pick._id,
          match: `${pick.teamHome.name} vs ${pick.teamAway.name}`,
          market: pick.market,
          odds: pick.oddsAtDetection,
        },
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Recreate picks from March 24 (Doncaster vs Port Vale)
   * GET /betting/test/recreate-march24
   */
  @Get('recreate-march24')
  async recreateMarch24Picks() {
    try {
      const kickoffDate = new Date('2026-03-24T13:45:00Z')
      const pickDate = new Date('2026-03-24T00:00:00Z')

      // Pick 1: Corners Handicap Local (-2) @2.00
      const pick1Data = {
        fixtureId: 1234567, // Placeholder
        date: pickDate,
        league: {
          id: 39, // League One
          name: 'League One',
          country: 'England',
          tier: 3,
        },
        teamHome: { id: 67, name: 'Doncaster' },
        teamAway: { id: 68, name: 'Port Vale' },
        kickoff: kickoffDate,
        market: MarketType.CORNERS_HANDICAP,
        direction: MarketDirection.OVER,
        line: -2,
        probOwn: 0.72,
        probImplied: 0.50,
        edge: 0.216,
        confidenceScore: 72,
        oddsAtDetection: 2.00,
        oddsAtBet: 2.00,
        stake: 3.00,
        stars: 5,
        status: PickStatus.PENDING,
        reasons: [
          'Modelo: Doncaster +0.0 vs Casa: -2.0',
          'Edge: 21.6% | Prob: 72%',
        ],
        telegramAlertSent: true,
        betPlaced: false,
        modelInputs: {
          handicapLineExpected: 0,
          handicapLineBookmaker: -2,
          calculationExplanation: 'Doncaster debe ganar por 2+ corners de diferencia',
        },
      }

      // Pick 2: Under 10.5 Corners @1.70
      const pick2Data = {
        fixtureId: 1234567, // Same fixture
        date: pickDate,
        league: {
          id: 39,
          name: 'League One',
          country: 'England',
          tier: 3,
        },
        teamHome: { id: 67, name: 'Doncaster' },
        teamAway: { id: 68, name: 'Port Vale' },
        kickoff: kickoffDate,
        market: MarketType.UNDER_105_CORNERS,
        direction: MarketDirection.UNDER,
        line: 10.5,
        probOwn: 0.65,
        probImplied: 0.59,
        edge: 0.10,
        confidenceScore: 60,
        oddsAtDetection: 1.70,
        oddsAtBet: 1.70,
        stake: 3.00,
        stars: 3,
        status: PickStatus.PENDING,
        reasons: ['Corners estimados: 9.1'],
        telegramAlertSent: true,
        betPlaced: false,
        modelInputs: {
          cornersExpected: 9.1,
        },
      }

      // Insert picks using upsert to avoid duplicates
      const pick1 = await this.bettingPickModel.findOneAndUpdate(
        { fixtureId: pick1Data.fixtureId, market: pick1Data.market, direction: pick1Data.direction },
        { $setOnInsert: pick1Data },
        { upsert: true, new: true }
      )
      const pick2 = await this.bettingPickModel.findOneAndUpdate(
        { fixtureId: pick2Data.fixtureId, market: pick2Data.market, direction: pick2Data.direction },
        { $setOnInsert: pick2Data },
        { upsert: true, new: true }
      )

      return {
        success: true,
        message: '2 picks recreated for March 24',
        picks: [
          {
            id: pick1._id,
            match: 'Doncaster vs Port Vale',
            market: pick1.market,
            line: pick1.line,
            odds: pick1.oddsAtDetection,
            stars: pick1.stars,
          },
          {
            id: pick2._id,
            match: 'Doncaster vs Port Vale',
            market: pick2.market,
            line: pick2.line,
            odds: pick2.oddsAtDetection,
            stars: pick2.stars,
          },
        ],
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Debug: Show pending picks and their eligibility for result collection
   * GET /betting/test/pending-picks
   */
  @Get('pending-picks')
  async getPendingPicks() {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

    const pendingPicks = await this.bettingPickModel
      .find({ status: { $in: ['PENDING', 'ACTIVE'] } })
      .sort({ kickoff: 1 })
      .exec()

    return {
      currentTime: now.toISOString(),
      twoHoursAgoThreshold: twoHoursAgo.toISOString(),
      totalPending: pendingPicks.length,
      picks: pendingPicks.map(p => ({
        id: p._id,
        fixtureId: p.fixtureId,
        match: `${p.teamHome.name} vs ${p.teamAway.name}`,
        kickoff: p.kickoff,
        kickoffISO: p.kickoff?.toISOString(),
        status: p.status,
        eligibleForCollection: p.kickoff ? p.kickoff <= twoHoursAgo : false,
        hoursAgo: p.kickoff ? ((now.getTime() - p.kickoff.getTime()) / (1000 * 60 * 60)).toFixed(1) : 'N/A',
      })),
    }
  }

  /**
   * Check fixture stats from API-Football
   * GET /betting/test/fixture-stats?fixtureId=1536901
   */
  @Get('fixture-stats')
  async getFixtureStats(@Query('fixtureId') fixtureId: string) {
    try {
      const stats = await this.apiFootball.getFixtureStats(parseInt(fixtureId))
      return {
        fixtureId: parseInt(fixtureId),
        stats,
        isFinished: stats ? ['FT', 'AET', 'PEN'].includes(stats.status) : false,
      }
    } catch (error) {
      return { error: String(error), fixtureId }
    }
  }

  /**
   * Check league coverage in API-Football
   * GET /betting/test/check-coverage?ids=78,88,179,253
   */
  @Get('check-coverage')
  async checkCoverage(@Query('ids') ids: string) {
    if (!ids) {
      return { error: 'IDs parameter required (comma-separated)' }
    }

    const leagueIds = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
    const results: any[] = []

    for (const leagueId of leagueIds) {
      try {
        const leagueInfo = await this.apiFootball.getLeagueInfo(leagueId)
        const seasonInfo = await this.apiFootball.getLeagueSeasonInfo(leagueId)

        // Check if already in our database
        const existsInDb = await this.bettingLeagueModel.findOne({ apiFootballId: leagueId }).exec()

        results.push({
          id: leagueId,
          name: leagueInfo?.name || 'Unknown',
          country: leagueInfo?.country || 'Unknown',
          type: leagueInfo?.type || 'Unknown',
          season: seasonInfo?.season,
          inDatabase: !!existsInDb,
          dbTier: existsInDb?.tier,
          dbActive: existsInDb?.isActive,
          coverage: seasonInfo?.coverage ? {
            fixtures: seasonInfo.coverage.fixtures?.statistics_fixtures ?? false,
            lineups: seasonInfo.coverage.fixtures?.lineups ?? false,
            standings: seasonInfo.coverage.standings ?? false,
            predictions: seasonInfo.coverage.predictions ?? false,
            odds: seasonInfo.coverage.odds ?? false,
          } : null,
          recommended: seasonInfo?.coverage?.odds && seasonInfo?.coverage?.fixtures?.statistics_fixtures,
        })
      } catch (error) {
        results.push({
          id: leagueId,
          error: String(error),
        })
      }
    }

    const withOdds = results.filter(r => r.coverage?.odds).length
    const withStats = results.filter(r => r.coverage?.fixtures).length

    return {
      total: results.length,
      withOdds,
      withStats,
      fullySupported: results.filter(r => r.recommended).length,
      results,
    }
  }

  /**
   * Search leagues by name in API-Football
   * GET /betting/test/search-leagues?name=women
   */
  @Get('search-leagues')
  async searchLeagues(@Query('name') name: string) {
    if (!name) {
      return { error: 'Name parameter required' }
    }

    try {
      const results = await this.apiFootball.searchLeagues(name)
      return {
        query: name,
        count: results.length,
        leagues: results.slice(0, 20), // Limit to 20 results
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Add all women's leagues (Tier 4)
   * GET /betting/test/add-women-leagues
   */
  @Get('add-women-leagues')
  async addWomenLeagues() {
    const womenLeagues = [
      { id: 525, name: 'UEFA Champions League Women' },
      { id: 44, name: 'FA WSL (England)' },
      { id: 142, name: 'Primera División Femenina (Spain)' },
      { id: 64, name: 'Feminine Division 1 (France)' },
    ]

    const results: any[] = []

    for (const league of womenLeagues) {
      try {
        // Check if exists
        const existing = await this.bettingLeagueModel.findOne({ apiFootballId: league.id }).exec()
        if (existing) {
          results.push({
            id: league.id,
            name: existing.name,
            status: 'already_exists',
            isActive: existing.isActive,
          })
          continue
        }

        // Fetch info from API-Football
        const leagueInfo = await this.apiFootball.getLeagueInfo(league.id)
        if (!leagueInfo) {
          results.push({
            id: league.id,
            name: league.name,
            status: 'not_found_in_api',
          })
          continue
        }

        const seasonInfo = await this.apiFootball.getLeagueSeasonInfo(league.id)

        // Create league as Tier 4, inactive by default
        const newLeague = await this.bettingLeagueModel.create({
          apiFootballId: league.id,
          name: leagueInfo.name,
          country: leagueInfo.country || 'International',
          division: 1,
          tier: 4,
          isActive: false, // Start inactive, activate manually
          logo: leagueInfo.logo,
          season: seasonInfo?.season?.toString(),
          seasonStart: seasonInfo?.seasonStart ? new Date(seasonInfo.seasonStart) : undefined,
          seasonEnd: seasonInfo?.seasonEnd ? new Date(seasonInfo.seasonEnd) : undefined,
          coverage: seasonInfo?.coverage ? {
            events: seasonInfo.coverage.fixtures?.events ?? false,
            lineups: seasonInfo.coverage.fixtures?.lineups ?? false,
            statisticsFixtures: seasonInfo.coverage.fixtures?.statistics_fixtures ?? false,
            statisticsPlayers: seasonInfo.coverage.fixtures?.statistics_players ?? false,
            standings: seasonInfo.coverage.standings ?? false,
            players: seasonInfo.coverage.players ?? false,
            topScorers: seasonInfo.coverage.top_scorers ?? false,
            predictions: seasonInfo.coverage.predictions ?? false,
            odds: seasonInfo.coverage.odds ?? false,
          } : undefined,
          stats: {},
          modelConfig: {},
          lastSynced: new Date(),
        })

        results.push({
          id: league.id,
          name: newLeague.name,
          country: newLeague.country,
          status: 'added',
          tier: newLeague.tier,
          isActive: newLeague.isActive,
          hasOdds: seasonInfo?.coverage?.odds ?? false,
        })
      } catch (error) {
        results.push({
          id: league.id,
          name: league.name,
          status: 'error',
          error: String(error),
        })
      }
    }

    const added = results.filter(r => r.status === 'added').length
    const existing = results.filter(r => r.status === 'already_exists').length

    return {
      success: true,
      message: `Added ${added} women's leagues (${existing} already existed)`,
      results,
      nextStep: 'Activate leagues in settings or use: /betting/test/add-league?id=XXX&active=true',
    }
  }

  /**
   * Clean duplicate picks (keeps oldest or one with betPlaced=true)
   * GET /betting/test/clean-duplicates
   */
  @Get('clean-duplicates')
  async cleanDuplicates() {
    try {
      // Find all duplicate groups
      const duplicates = await this.bettingPickModel.aggregate([
        {
          $group: {
            _id: {
              fixtureId: '$fixtureId',
              market: '$market',
              direction: '$direction',
            },
            count: { $sum: 1 },
            docs: { $push: { id: '$_id', createdAt: '$createdAt', betPlaced: '$betPlaced' } },
          },
        },
        {
          $match: { count: { $gt: 1 } },
        },
      ])

      let totalDeleted = 0
      const deletedDetails: any[] = []

      for (const group of duplicates) {
        const docs = group.docs

        // Sort: prioritize betPlaced=true, then oldest
        docs.sort((a: any, b: any) => {
          if (a.betPlaced && !b.betPlaced) return -1
          if (!a.betPlaced && b.betPlaced) return 1
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })

        // Keep the first one, delete the rest
        const toKeep = docs[0]
        const toDelete = docs.slice(1).map((d: any) => d.id)

        if (toDelete.length > 0) {
          await this.bettingPickModel.deleteMany({ _id: { $in: toDelete } })
          totalDeleted += toDelete.length
          deletedDetails.push({
            fixtureId: group._id.fixtureId,
            market: group._id.market,
            direction: group._id.direction,
            kept: toKeep.id,
            deleted: toDelete.length,
          })
        }
      }

      return {
        success: true,
        message: `Cleaned ${totalDeleted} duplicate picks`,
        duplicateGroups: duplicates.length,
        totalDeleted,
        details: deletedDetails,
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * List available sports from The Odds API
   * GET /betting/test/odds-api-sports
   */
  @Get('odds-api-sports')
  async listOddsApiSports(@Query('filter') filter?: string) {
    try {
      const sports = await this.oddsApi.getAvailableSports()

      // Filter to soccer only by default
      let filtered = sports.filter(s => s.group === 'Soccer')

      // Additional keyword filter if provided
      if (filter) {
        const lowerFilter = filter.toLowerCase()
        filtered = filtered.filter(s =>
          s.key.toLowerCase().includes(lowerFilter) ||
          s.title.toLowerCase().includes(lowerFilter)
        )
      }

      return {
        total: filtered.length,
        sports: filtered.map(s => ({
          key: s.key,
          title: s.title,
          active: s.active,
        })),
        usage: 'Use the "key" value to configure a league via /betting/test/set-odds-api-key',
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Set The Odds API sport key for a league
   * GET /betting/test/set-odds-api-key?leagueId=140&sportKey=soccer_spain_la_liga
   */
  @Get('set-odds-api-key')
  async setOddsApiSportKey(
    @Query('leagueId') leagueId: string,
    @Query('sportKey') sportKey: string
  ) {
    if (!leagueId || !sportKey) {
      return { error: 'Both leagueId and sportKey are required' }
    }

    const id = parseInt(leagueId)
    if (isNaN(id)) {
      return { error: 'Invalid leagueId' }
    }

    try {
      // Verify sport key exists
      const sports = await this.oddsApi.getAvailableSports()
      const sportExists = sports.some(s => s.key === sportKey)

      if (!sportExists) {
        return {
          error: `Sport key "${sportKey}" not found in The Odds API`,
          hint: 'Use /betting/test/odds-api-sports to see available keys',
        }
      }

      // Check if Pinnacle is available for this sport
      const hasPinnacle = await this.oddsApi.hasPinnacle(sportKey)

      const league = await this.bettingLeagueModel.findOneAndUpdate(
        { apiFootballId: id },
        {
          $set: {
            oddsApiSportKey: sportKey,
            hasOddsApi: true,
          }
        },
        { new: true }
      ).exec()

      if (!league) {
        return { error: 'League not found', leagueId: id }
      }

      return {
        success: true,
        league: {
          id: league.apiFootballId,
          name: league.name,
          oddsApiSportKey: league.oddsApiSportKey,
          hasOddsApi: league.hasOddsApi,
          hasPinnacle,
        },
        message: hasPinnacle
          ? '✅ Pinnacle odds available - sharp line reference enabled!'
          : '⚠️ No Pinnacle odds available for this league',
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Test The Odds API for a specific league
   * GET /betting/test/test-odds-api?leagueId=140
   */
  @Get('test-odds-api')
  async testOddsApi(@Query('leagueId') leagueId: string) {
    const id = parseInt(leagueId)
    if (isNaN(id)) {
      return { error: 'Invalid leagueId' }
    }

    try {
      const league = await this.bettingLeagueModel.findOne({ apiFootballId: id }).exec()
      if (!league) {
        return { error: 'League not found', leagueId: id }
      }

      if (!league.oddsApiSportKey) {
        return {
          error: 'League not configured for The Odds API',
          hint: 'Use /betting/test/set-odds-api-key to configure it',
          league: {
            id: league.apiFootballId,
            name: league.name,
          },
        }
      }

      // Fetch odds from The Odds API
      const [totalsOdds, totalsH1Odds] = await Promise.all([
        this.oddsApi.getNormalizedOdds(league.oddsApiSportKey, 'totals'),
        this.oddsApi.getNormalizedOdds(league.oddsApiSportKey, 'totals_h1'),
      ])

      const hasPinnacle = totalsOdds.some(o => o.pinnacleOver !== undefined)

      return {
        league: {
          id: league.apiFootballId,
          name: league.name,
          oddsApiSportKey: league.oddsApiSportKey,
        },
        totals: {
          events: totalsOdds.length,
          hasPinnacle,
          sample: totalsOdds.slice(0, 3).map(o => ({
            match: `${o.homeTeam} vs ${o.awayTeam}`,
            line: o.line,
            bestOver: o.bestOver,
            bestUnder: o.bestUnder,
            pinnacleOver: o.pinnacleOver,
            bookmakers: o.allBookmakers.length,
          })),
        },
        totals_h1: {
          events: totalsH1Odds.length,
          sample: totalsH1Odds.slice(0, 3).map(o => ({
            match: `${o.homeTeam} vs ${o.awayTeam}`,
            line: o.line,
            bestOver: o.bestOver,
            bestUnder: o.bestUnder,
          })),
        },
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Show leagues configured for The Odds API
   * GET /betting/test/odds-api-leagues
   */
  @Get('odds-api-leagues')
  async listOddsApiLeagues() {
    const leagues = await this.bettingLeagueModel
      .find({ hasOddsApi: true })
      .sort({ tier: 1, name: 1 })
      .exec()

    return {
      total: leagues.length,
      leagues: leagues.map(l => ({
        id: l.apiFootballId,
        name: l.name,
        country: l.country,
        tier: l.tier,
        isActive: l.isActive,
        oddsApiSportKey: l.oddsApiSportKey,
      })),
    }
  }

  /**
   * Clear fixtures cache for a date and re-scan
   * GET /betting/test/clear-cache-scan?date=2026-03-26
   */
  @Get('clear-cache-scan')
  async clearCacheAndScan(@Query('date') date: string) {
    if (!date) {
      return { error: 'Date required (format: YYYY-MM-DD)' }
    }

    // Clear all fixtures cache for this date
    const pattern = `betting:fixtures:${date}:*`
    await this.redisCache.deletePattern(pattern)

    // Also clear team stats and odds cache (they might be stale too)
    await this.redisCache.deletePattern('betting:team-stats:*')
    await this.redisCache.deletePattern('betting:odds:*')

    // Now run scan
    const result = await this.nightlyAnalysis.triggerManualAnalysis(date)

    return {
      success: true,
      message: `Cache cleared and scan completed for ${date}`,
      cacheCleared: pattern,
      ...result,
    }
  }

  /**
   * Test fetching fixtures directly for a league (bypasses cache)
   * GET /betting/test/test-fixtures?leagueId=39&date=2026-03-28
   */
  @Get('test-fixtures')
  async testFixtures(
    @Query('leagueId') leagueId: string,
    @Query('date') date: string
  ) {
    const id = parseInt(leagueId)
    if (isNaN(id)) {
      return { error: 'Invalid leagueId' }
    }

    if (!date) {
      // Default to tomorrow
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      date = tomorrow.toISOString().split('T')[0]
    }

    try {
      // Clear cache for this specific league+date first
      const cacheKey = `betting:fixtures:${date}:${id}`
      await this.redisCache.delete(cacheKey)

      // Fetch fresh fixtures
      const league = await this.bettingLeagueModel.findOne({ apiFootballId: id }).exec()
      if (!league) {
        return { error: 'League not found', leagueId: id }
      }

      const fixtures = await this.apiFootball.getFixtures(date, id, league.season || '2025')

      // Filter upcoming
      const now = new Date()
      const upcoming = fixtures.filter(f => new Date(f.kickoff) > now)

      return {
        league: {
          id: league.apiFootballId,
          name: league.name,
          season: league.season,
        },
        date,
        totalFixtures: fixtures.length,
        upcomingFixtures: upcoming.length,
        fixtures: upcoming.map(f => ({
          id: f.fixtureId,
          match: `${f.homeTeamName} vs ${f.awayTeamName}`,
          kickoff: f.kickoff,
          venue: f.venue,
          status: f.status,
        })),
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Check API configuration
   * GET /betting/test/api-status
   */
  @Get('api-status')
  async apiStatus() {
    const apiKey = this.configService.get<string>('API_FOOTBALL_KEY')
    const oddsApiKey = this.configService.get<string>('THE_ODDS_API_KEY')

    return {
      apiFootball: {
        configured: !!apiKey,
        keyLength: apiKey?.length || 0,
        keyPreview: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : null,
      },
      theOddsApi: {
        configured: !!oddsApiKey,
        keyLength: oddsApiKey?.length || 0,
      },
      redis: {
        available: this.redisCache.isAvailable(),
      },
    }
  }

  /**
   * Raw API test - checks API Football directly
   * GET /betting/test/raw-api-test
   */
  @Get('raw-api-test')
  async rawApiTest() {
    const apiKey = this.configService.get<string>('API_FOOTBALL_KEY')
    if (!apiKey) {
      return { error: 'API_FOOTBALL_KEY not configured' }
    }

    try {
      // Test /status endpoint
      const statusRes = await fetch('https://v3.football.api-sports.io/status', {
        headers: { 'x-apisports-key': apiKey },
      })
      const statusData = await statusRes.json()

      // Test /leagues endpoint
      const leaguesRes = await fetch('https://v3.football.api-sports.io/leagues?id=39', {
        headers: { 'x-apisports-key': apiKey },
      })
      const leaguesData = await leaguesRes.json()

      // Test /fixtures endpoint for Premier League
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = tomorrow.toISOString().split('T')[0]

      const fixturesRes = await fetch(
        `https://v3.football.api-sports.io/fixtures?date=${dateStr}&league=39&season=2025`,
        { headers: { 'x-apisports-key': apiKey } }
      )
      const fixturesData = await fixturesRes.json()

      return {
        status: {
          httpStatus: statusRes.status,
          response: statusData.response || statusData,
          errors: statusData.errors,
        },
        leagues: {
          httpStatus: leaguesRes.status,
          count: leaguesData.response?.length || 0,
          errors: leaguesData.errors,
          sample: leaguesData.response?.[0] || null,
        },
        fixtures: {
          httpStatus: fixturesRes.status,
          date: dateStr,
          count: fixturesData.response?.length || 0,
          errors: fixturesData.errors,
        },
      }
    } catch (error) {
      return { error: String(error) }
    }
  }

  /**
   * Full diagnostics: check all active leagues for fixtures
   * GET /betting/test/diagnose-all?date=2026-03-28
   */
  @Get('diagnose-all')
  async diagnoseAll(@Query('date') date: string) {
    if (!date) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      date = tomorrow.toISOString().split('T')[0]
    }

    const leagues = await this.bettingLeagueModel
      .find({ isActive: true })
      .sort({ tier: 1, name: 1 })
      .exec()

    const results: any[] = []
    let totalFixtures = 0

    for (const league of leagues) {
      // Clear cache
      const cacheKey = `betting:fixtures:${date}:${league.apiFootballId}`
      await this.redisCache.delete(cacheKey)

      // Fetch fresh
      const fixtures = await this.apiFootball.getFixtures(
        date,
        league.apiFootballId,
        league.season || '2025'
      )

      const now = new Date()
      const upcoming = fixtures.filter(f => new Date(f.kickoff) > now)

      totalFixtures += upcoming.length

      if (upcoming.length > 0) {
        results.push({
          id: league.apiFootballId,
          name: league.name,
          fixtures: upcoming.length,
          matches: upcoming.slice(0, 3).map(f => `${f.homeTeamName} vs ${f.awayTeamName}`),
        })
      }
    }

    return {
      date,
      activeLeagues: leagues.length,
      leaguesWithFixtures: results.length,
      totalFixtures,
      details: results,
    }
  }

  /**
   * Reset telegramAlertSent flag for testing
   * GET /betting/test/reset-telegram-flags?date=2026-03-26
   */
  @Get('reset-telegram-flags')
  async resetTelegramFlags(@Query('date') date?: string) {
    // Use provided date or calculate tomorrow
    let targetDate: string
    if (date) {
      targetDate = date
    } else {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      targetDate = tomorrow.toISOString().split('T')[0]
    }
    const targetDateStart = new Date(`${targetDate}T00:00:00.000Z`)
    const targetDateEnd = new Date(`${targetDate}T23:59:59.999Z`)

    const picksResult = await this.bettingPickModel.updateMany(
      { kickoff: { $gte: targetDateStart, $lte: targetDateEnd } },
      { $set: { telegramAlertSent: false } }
    )

    const combosResult = await this.bettingComboModel.updateMany(
      { date: { $gte: targetDateStart, $lte: targetDateEnd } },
      { $set: { telegramAlertSent: false } }
    )

    return {
      success: true,
      message: 'Telegram flags reset',
      date: targetDate,
      picksReset: picksResult.modifiedCount,
      combosReset: combosResult.modifiedCount,
    }
  }
}
