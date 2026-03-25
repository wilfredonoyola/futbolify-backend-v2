import { Controller, Get, Query } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { NightlyAnalysisCron } from './cron/nightly-analysis.cron'
import { PreMatchCheckCron } from './cron/pre-match-check.cron'
import { OddsMonitorCron } from './cron/odds-monitor.cron'
import { ResultCollectorCron } from './cron/result-collector.cron'
import { ApiFootballBettingService } from './services/api-football-betting.service'
import { ScoringGoalsService } from './services/scoring-goals.service'
import { ValueDetectionService } from './services/value-detection.service'
import { BettingLeague, BettingLeagueDocument } from './schemas/betting-league.schema'

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
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>
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
}
