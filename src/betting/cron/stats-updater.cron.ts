import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  BettingLeague,
  BettingLeagueDocument,
} from '../schemas/betting-league.schema'
import { ApiFootballBettingService } from '../services/api-football-betting.service'

/**
 * Stats Updater Cron Job
 * Runs Monday at 8:30 AM El Salvador time
 *
 * Purpose:
 * - Update league-level statistics for active leagues
 * - Recalculate avgGoals1H, avgCornersPerMatch, over05_1H_pct, etc.
 * - Only processes leagues with isActive: true
 */
@Injectable()
export class StatsUpdaterCron {
  private readonly logger = new Logger(StatsUpdaterCron.name)

  constructor(
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    private apiFootballService: ApiFootballBettingService
  ) {}

  /**
   * Monday 8:30 AM El Salvador - Update stats for active leagues
   */
  @Cron('30 8 * * 1', {
    name: 'betting-stats-updater',
    timeZone: 'America/El_Salvador',
  })
  async updateStats(): Promise<void> {
    this.logger.log('Starting weekly stats update...')
    const startTime = Date.now()

    try {
      // Get only active leagues
      const activeLeagues = await this.bettingLeagueModel
        .find({ isActive: true })
        .exec()

      this.logger.log(`Found ${activeLeagues.length} active leagues to update`)

      let updated = 0
      let errors = 0

      for (const league of activeLeagues) {
        try {
          await this.updateLeagueStats(league)
          updated++
        } catch (error) {
          errors++
          this.logger.error(
            `Failed to update stats for ${league.name}: ${error}`
          )
        }

        // Respect rate limits
        await this.delay(500)
      }

      const duration = Date.now() - startTime
      this.logger.log(
        `Stats update completed in ${duration}ms: ` +
          `${updated} leagues updated, ${errors} errors`
      )
    } catch (error) {
      this.logger.error(`Stats update failed: ${error}`)
    }
  }

  /**
   * Update statistics for a single league
   */
  private async updateLeagueStats(
    league: BettingLeagueDocument
  ): Promise<void> {
    // Get league statistics from API-Football
    const leagueStats = await this.fetchLeagueStats(league.apiFootballId)

    if (!leagueStats) {
      this.logger.warn(`No stats available for ${league.name}`)
      return
    }

    // Update league stats in database
    await this.bettingLeagueModel.updateOne(
      { _id: league._id },
      {
        $set: {
          'stats.avgGoals1H': leagueStats.avgGoals1H,
          'stats.over05_1H_pct': leagueStats.over05_1H_pct,
          'stats.over15_1H_pct': leagueStats.over15_1H_pct,
          'stats.avgCornersPerMatch': leagueStats.avgCornersPerMatch,
          'stats.avgShotsPerMatch': leagueStats.avgShotsPerMatch,
          'stats.bts1H_pct': leagueStats.bts1H_pct,
          'stats.matchesPlayed': leagueStats.matchesPlayed,
          'stats.lastUpdated': new Date(),
        },
      }
    )

    this.logger.debug(
      `Updated stats for ${league.name}: avgGoals1H=${leagueStats.avgGoals1H.toFixed(2)}, ` +
        `over05_1H=${(leagueStats.over05_1H_pct * 100).toFixed(1)}%`
    )
  }

  /**
   * Fetch league statistics from API-Football
   */
  private async fetchLeagueStats(leagueId: number): Promise<{
    avgGoals1H: number
    over05_1H_pct: number
    over15_1H_pct: number
    avgCornersPerMatch: number
    avgShotsPerMatch: number
    bts1H_pct: number
    matchesPlayed: number
  } | null> {
    try {
      // Get recent fixtures with statistics
      const fixtures = await this.apiFootballService.getFixtures(
        this.getPastDateString(30), // Last 30 days
        leagueId
      )

      if (!fixtures || fixtures.length < 5) {
        return null
      }

      // Calculate statistics from fixtures
      let totalGoals1H = 0
      let over05Count = 0
      let over15Count = 0
      let bts1HCount = 0
      let totalCorners = 0
      let totalShots = 0
      let matchesWithStats = 0

      for (const fixture of fixtures) {
        // Only include completed fixtures with half-time data
        if (
          fixture.status !== 'FT' &&
          fixture.status !== 'AET' &&
          fixture.status !== 'PEN'
        ) {
          continue
        }

        const homeHT = fixture.homeGoals1H ?? 0
        const awayHT = fixture.awayGoals1H ?? 0
        const goals1H = homeHT + awayHT

        totalGoals1H += goals1H
        if (goals1H >= 1) over05Count++
        if (goals1H >= 2) over15Count++
        if (homeHT > 0 && awayHT > 0) bts1HCount++

        matchesWithStats++
      }

      if (matchesWithStats < 5) {
        return null
      }

      return {
        avgGoals1H: totalGoals1H / matchesWithStats,
        over05_1H_pct: over05Count / matchesWithStats,
        over15_1H_pct: over15Count / matchesWithStats,
        avgCornersPerMatch: totalCorners / matchesWithStats,
        avgShotsPerMatch: totalShots / matchesWithStats,
        bts1H_pct: bts1HCount / matchesWithStats,
        matchesPlayed: matchesWithStats,
      }
    } catch (error) {
      this.logger.error(
        `Failed to fetch stats for league ${leagueId}: ${error}`
      )
      return null
    }
  }

  /**
   * Get date string N days in the past
   */
  private getPastDateString(daysAgo: number): string {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    return date.toISOString().split('T')[0]
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualUpdate(): Promise<{
    leagues: number
    updated: number
    errors: number
  }> {
    this.logger.log('Manual stats update triggered')

    const activeLeagues = await this.bettingLeagueModel
      .find({ isActive: true })
      .exec()

    let updated = 0
    let errors = 0

    for (const league of activeLeagues) {
      try {
        await this.updateLeagueStats(league)
        updated++
      } catch {
        errors++
      }
      await this.delay(500)
    }

    return { leagues: activeLeagues.length, updated, errors }
  }
}
