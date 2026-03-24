import { Controller, Get, Query } from '@nestjs/common'
import { NightlyAnalysisCron } from './cron/nightly-analysis.cron'
import { PreMatchCheckCron } from './cron/pre-match-check.cron'
import { OddsMonitorCron } from './cron/odds-monitor.cron'
import { ApiFootballBettingService } from './services/api-football-betting.service'
import { ScoringGoalsService } from './services/scoring-goals.service'
import { ValueDetectionService } from './services/value-detection.service'

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
    private apiFootball: ApiFootballBettingService,
    private scoringGoals: ScoringGoalsService,
    private valueDetection: ValueDetectionService
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
