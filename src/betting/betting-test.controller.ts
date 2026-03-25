import { Controller, Get, Query } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ConfigService } from '@nestjs/config'
import { Model } from 'mongoose'
import { NightlyAnalysisCron } from './cron/nightly-analysis.cron'
import { PreMatchCheckCron } from './cron/pre-match-check.cron'
import { OddsMonitorCron } from './cron/odds-monitor.cron'
import { ResultCollectorCron } from './cron/result-collector.cron'
import { ApiFootballBettingService } from './services/api-football-betting.service'
import { ScoringGoalsService } from './services/scoring-goals.service'
import { ValueDetectionService } from './services/value-detection.service'
import { BettingTelegramService } from './telegram/betting-telegram.service'
import { BettingLeague, BettingLeagueDocument } from './schemas/betting-league.schema'
import { BettingPick, BettingPickDocument } from './schemas/betting-pick.schema'
import { BettingCombo, BettingComboDocument } from './schemas/betting-combo.schema'
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
    private scoringGoals: ScoringGoalsService,
    private valueDetection: ValueDetectionService,
    private telegramService: BettingTelegramService,
    private configService: ConfigService,
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>
  ) {}

  /**
   * Trigger manual nightly analysis scan
   * GET /betting/test/scan?date=2026-04-07
   */
  @Get('scan')
  async triggerScan(@Query('date') date?: string) {
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

    return {
      success: true,
      date,
      picksDeleted: picksResult.deletedCount,
      combosDeleted: combosResult.deletedCount,
    }
  }

  /**
   * Get tomorrow's picks
   * GET /betting/test/tomorrow-picks
   */
  @Get('tomorrow-picks')
  async getTomorrowPicks() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const dayAfter = new Date(tomorrow)
    dayAfter.setDate(dayAfter.getDate() + 1)

    const picks = await this.bettingPickModel
      .find({ kickoff: { $gte: tomorrow, $lt: dayAfter } })
      .sort({ confidenceScore: -1 })
      .exec()

    const combos = await this.bettingComboModel
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ score: -1 })
      .exec()

    return {
      date: tomorrow.toISOString().split('T')[0],
      picksCount: picks.length,
      combosCount: combos.length,
      picks: picks.map(p => ({
        match: `${p.teamHome.name} vs ${p.teamAway.name}`,
        league: p.league.name,
        market: p.market,
        odds: p.oddsAtDetection?.toFixed(2),
        edge: `${(p.edge * 100).toFixed(1)}%`,
        score: p.confidenceScore,
        stars: p.stars,
        stake: p.stake?.toFixed(2),
        kickoff: p.kickoff,
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
   * Get available bookmakers for a fixture
   * GET /betting/test/bookmakers?fixtureId=1391116
   */
  @Get('bookmakers')
  async getBookmakers(@Query('fixtureId') fixtureId: string) {
    try {
      const fId = parseInt(fixtureId)
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
}
