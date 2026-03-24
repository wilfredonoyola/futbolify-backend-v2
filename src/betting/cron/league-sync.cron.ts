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
 * League Sync Cron Job
 * Runs Monday at 6:00 AM El Salvador time
 *
 * Purpose:
 * - Sync league status with API-Football
 * - Detect active/inactive seasons
 * - Update coverage information
 * - Activate summer leagues when they start
 */
@Injectable()
export class LeagueSyncCron {
  private readonly logger = new Logger(LeagueSyncCron.name)

  constructor(
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    private apiFootballService: ApiFootballBettingService
  ) {}

  /**
   * Monday 6:00 AM El Salvador - Sync leagues with API-Football
   */
  @Cron('0 6 * * 1', {
    name: 'betting-league-sync',
    timeZone: 'America/El_Salvador',
  })
  async syncLeagues(): Promise<void> {
    this.logger.log('Starting weekly league sync...')
    const startTime = Date.now()

    try {
      // Get all leagues from database
      const leagues = await this.bettingLeagueModel.find().exec()
      this.logger.log(`Found ${leagues.length} leagues to sync`)

      let activated = 0
      let deactivated = 0
      let updated = 0
      let errors = 0

      for (const league of leagues) {
        try {
          const syncResult = await this.syncSingleLeague(league)

          if (syncResult.activated) activated++
          if (syncResult.deactivated) deactivated++
          if (syncResult.updated) updated++
        } catch (error) {
          errors++
          this.logger.error(
            `Failed to sync league ${league.name}: ${error}`
          )
        }

        // Small delay to respect rate limits
        await this.delay(200)
      }

      const duration = Date.now() - startTime
      this.logger.log(
        `League sync completed in ${duration}ms: ` +
          `${activated} activated, ${deactivated} deactivated, ` +
          `${updated} updated, ${errors} errors`
      )
    } catch (error) {
      this.logger.error(`League sync failed: ${error}`)
    }
  }

  /**
   * Sync a single league with API-Football
   */
  private async syncSingleLeague(league: BettingLeagueDocument): Promise<{
    activated: boolean
    deactivated: boolean
    updated: boolean
  }> {
    const result = { activated: false, deactivated: false, updated: false }

    // Get current season info from API-Football
    const seasonInfo = await this.apiFootballService.getLeagueSeasonInfo(
      league.apiFootballId
    )

    if (!seasonInfo) {
      this.logger.warn(`No season info for ${league.name}`)
      return result
    }

    const now = new Date()
    const seasonStart = seasonInfo.seasonStart
      ? new Date(seasonInfo.seasonStart)
      : null
    const seasonEnd = seasonInfo.seasonEnd
      ? new Date(seasonInfo.seasonEnd)
      : null

    // Determine if league should be active
    const shouldBeActive =
      seasonStart &&
      seasonEnd &&
      now >= seasonStart &&
      now <= seasonEnd &&
      seasonInfo.coverage?.fixtures?.events === true

    // Track changes
    const wasActive = league.isActive
    const willBeActive = shouldBeActive

    // Update league document
    const updates: Partial<BettingLeague> = {
      lastSynced: now,
    }

    if (seasonInfo.season) {
      updates.season = String(seasonInfo.season)
    }
    if (seasonStart) {
      updates.seasonStart = seasonStart
    }
    if (seasonEnd) {
      updates.seasonEnd = seasonEnd
    }
    if (seasonInfo.coverage) {
      updates.coverage = {
        events: seasonInfo.coverage.fixtures?.events ?? false,
        lineups: seasonInfo.coverage.fixtures?.lineups ?? false,
        statisticsFixtures:
          seasonInfo.coverage.fixtures?.statistics_fixtures ?? false,
        statisticsPlayers:
          seasonInfo.coverage.fixtures?.statistics_players ?? false,
        standings: seasonInfo.coverage.standings ?? false,
        players: seasonInfo.coverage.players ?? false,
        topScorers: seasonInfo.coverage.top_scorers ?? false,
        predictions: seasonInfo.coverage.predictions ?? false,
        odds: seasonInfo.coverage.odds ?? false,
      }
    }

    // Update active status
    if (willBeActive !== wasActive) {
      updates.isActive = willBeActive

      if (willBeActive) {
        result.activated = true
        this.logger.log(`Activated league: ${league.name} (season ${seasonInfo.season})`)
      } else {
        result.deactivated = true
        this.logger.log(`Deactivated league: ${league.name}`)
      }
    }

    // Apply updates
    await this.bettingLeagueModel.updateOne(
      { _id: league._id },
      { $set: updates }
    )
    result.updated = true

    return result
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
  async triggerManualSync(): Promise<{
    leagues: number
    activated: number
    deactivated: number
    errors: number
  }> {
    this.logger.log('Manual league sync triggered')

    const leagues = await this.bettingLeagueModel.find().exec()
    let activated = 0
    let deactivated = 0
    let errors = 0

    for (const league of leagues) {
      try {
        const result = await this.syncSingleLeague(league)
        if (result.activated) activated++
        if (result.deactivated) deactivated++
      } catch {
        errors++
      }
      await this.delay(200)
    }

    return { leagues: leagues.length, activated, deactivated, errors }
  }
}
