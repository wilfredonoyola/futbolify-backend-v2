import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { FhgDataService } from './fhg-data.service'
import { FhgSelectionService } from './fhg-selection.service'
import { FhgHealthService } from './fhg-health.service'
import { FhgLogService } from './fhg-log.service'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'

/**
 * FHG Scheduler Service
 * Automates the daily pipeline with cron jobs
 *
 * Schedule:
 * - 06:00 - Import matches (7 days ahead)
 * - 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00 - Refresh odds
 * - 10:00 - Run daily pipeline (generate selections)
 * - Every hour - Settle finished selections
 * - 04:00 Sunday - Refresh team statistics
 */
@Injectable()
export class FhgSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FhgSchedulerService.name)

  constructor(
    private readonly dataService: FhgDataService,
    private readonly selectionService: FhgSelectionService,
    private readonly healthService: FhgHealthService,
    private readonly logService: FhgLogService
  ) {}

  /**
   * Log startup message when module initializes
   */
  async onModuleInit() {
    await this.logService.info(
      FhgLogCategory.CRON,
      'FHG Scheduler initialized - Cron jobs registered',
      {
        jobs: [
          '06:00 - Import matches',
          '08,10,12,14,16,18,20,22:00 - Refresh odds',
          '10:00 - Daily pipeline',
          'Every hour - Settlement',
          '04:00 Sunday - Team stats',
        ],
      }
    )
    this.logger.log('FHG Scheduler initialized with cron jobs')
  }

  /**
   * Import matches daily at 06:00
   * Fetches fixtures for the next 7 days from API-Football
   */
  @Cron('0 6 * * *', { name: 'fhg-import-matches', timeZone: 'America/New_York' })
  async importMatches() {
    const startTime = Date.now()
    await this.logService.info(
      FhgLogCategory.CRON,
      'Starting scheduled match import (7 days)'
    )

    try {
      const result = await this.dataService.importMatches(undefined, 7)

      await this.logService.info(
        FhgLogCategory.CRON,
        `Match import completed: ${result.created} created, ${result.updated} updated`,
        {
          ...result,
          executionTimeMs: Date.now() - startTime,
        }
      )
    } catch (error) {
      await this.logService.error(
        FhgLogCategory.CRON,
        `Match import failed: ${error}`,
        { error: String(error) }
      )
    }
  }

  /**
   * Refresh odds every 2 hours from 08:00 to 22:00
   * Updates G1H odds from The Odds API
   */
  @Cron('0 8,10,12,14,16,18,20,22 * * *', { name: 'fhg-refresh-odds', timeZone: 'America/New_York' })
  async refreshOdds() {
    const startTime = Date.now()
    await this.logService.info(FhgLogCategory.CRON, 'Starting scheduled odds refresh')

    try {
      const result = await this.dataService.importOdds()

      await this.logService.info(
        FhgLogCategory.CRON,
        `Odds refresh completed: ${result.created} created, ${result.updated} updated`,
        {
          ...result,
          executionTimeMs: Date.now() - startTime,
        }
      )
    } catch (error) {
      await this.logService.error(
        FhgLogCategory.CRON,
        `Odds refresh failed: ${error}`,
        { error: String(error) }
      )
    }
  }

  /**
   * Run daily pipeline at 10:00
   * Generates predictions and selections for today's matches
   */
  @Cron('0 10 * * *', { name: 'fhg-daily-pipeline', timeZone: 'America/New_York' })
  async runDailyPipeline() {
    const startTime = Date.now()
    await this.logService.info(FhgLogCategory.CRON, 'Starting scheduled daily pipeline')

    try {
      const result = await this.selectionService.runDailyPipeline()

      await this.logService.info(
        FhgLogCategory.CRON,
        `Daily pipeline completed: ${result.selectionsCreated} selections created`,
        {
          pipelineId: result.pipelineId,
          matchesAnalyzed: result.matchesAnalyzed,
          candidatesFound: result.candidatesFound,
          selectionsCreated: result.selectionsCreated,
          executionTimeMs: Date.now() - startTime,
        }
      )

      // Log each selection
      for (const selection of result.selections) {
        await this.logService.info(
          FhgLogCategory.CRON,
          `Selection: ${selection.homeTeam} vs ${selection.awayTeam} | ${selection.signal} | margin: ${(selection.marginValor * 100).toFixed(1)}%`,
          { selectionId: selection.id }
        )
      }
    } catch (error) {
      await this.logService.error(
        FhgLogCategory.CRON,
        `Daily pipeline failed: ${error}`,
        { error: String(error) }
      )
    }
  }

  /**
   * Settle selections every hour
   * Checks finished matches and calculates outcomes
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'fhg-settle-selections' })
  async settleSelections() {
    const startTime = Date.now()

    try {
      const result = await this.selectionService.settleSelections()

      // Only log if there were settlements
      if (result.settled > 0) {
        await this.logService.info(
          FhgLogCategory.CRON,
          `Settlement completed: ${result.settled} settled (${result.won}W, ${result.lost}L, ${result.voided}V)`,
          {
            ...result,
            executionTimeMs: Date.now() - startTime,
          }
        )
      }
    } catch (error) {
      await this.logService.error(
        FhgLogCategory.CRON,
        `Settlement failed: ${error}`,
        { error: String(error) }
      )
    }
  }

  /**
   * Refresh team statistics weekly on Sunday at 04:00
   * Updates G1H rates and form data from API-Football
   */
  @Cron('0 4 * * 0', { name: 'fhg-refresh-team-stats', timeZone: 'America/New_York' })
  async refreshTeamStats() {
    const startTime = Date.now()
    await this.logService.info(
      FhgLogCategory.CRON,
      'Starting scheduled weekly team stats refresh'
    )

    try {
      const result = await this.dataService.refreshTeamStats()

      await this.logService.info(
        FhgLogCategory.CRON,
        `Team stats refresh completed: ${result.updated} updated`,
        {
          ...result,
          executionTimeMs: Date.now() - startTime,
        }
      )
    } catch (error) {
      await this.logService.error(
        FhgLogCategory.CRON,
        `Team stats refresh failed: ${error}`,
        { error: String(error) }
      )
    }
  }

  /**
   * Generate health report daily at 23:00
   */
  @Cron('0 23 * * *', { name: 'fhg-health-report', timeZone: 'America/New_York' })
  async generateHealthReport() {
    const startTime = Date.now()

    try {
      const report = await this.healthService.generateHealthReport()

      await this.logService.info(
        FhgLogCategory.CRON,
        `Daily health report: ${report.status} | CLV: ${report.avgClv !== null ? (report.avgClv * 100).toFixed(2) + '%' : 'N/A'} | Hit Rate: ${(report.hitRate * 100).toFixed(1)}%`,
        {
          status: report.status,
          avgClv: report.avgClv,
          hitRate: report.hitRate,
          roi: report.roi,
          totalSelections: report.totalSelections,
          executionTimeMs: Date.now() - startTime,
        }
      )
    } catch (error) {
      await this.logService.error(
        FhgLogCategory.CRON,
        `Health report generation failed: ${error}`,
        { error: String(error) }
      )
    }
  }
}
