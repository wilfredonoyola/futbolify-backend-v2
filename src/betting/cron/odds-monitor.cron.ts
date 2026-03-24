import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import { ApiFootballBettingService } from '../services/api-football-betting.service'
import { BettingTelegramService } from '../telegram/betting-telegram.service'
import { PickStatus, SteamMoveDirection } from '../enums/betting.enums'

/**
 * Odds Monitor Cron Job
 * Runs every 30 minutes during match windows
 *
 * Schedule:
 * - Weekend (Sat/Sun): 6 AM - 2 PM El Salvador
 * - Midweek (Tue/Wed/Thu): 10 AM - 3 PM El Salvador (Champions/Europa League)
 *
 * Purpose:
 * - Monitor odds changes for active picks
 * - Detect late steam moves
 * - Track CLV pre-match
 * - Alert on significant changes
 */
@Injectable()
export class OddsMonitorCron {
  private readonly logger = new Logger(OddsMonitorCron.name)

  // Significant change threshold (10% per documento maestro sección 4.3)
  private readonly SIGNIFICANT_CHANGE = 0.10 // 10% change = steam move

  constructor(
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    private apiFootballService: ApiFootballBettingService,
    private telegramService: BettingTelegramService
  ) {}

  /**
   * Every 30 minutes from 6 AM to 2 PM on Saturday and Sunday
   */
  @Cron('*/30 6-14 * * 6,0', {
    name: 'betting-odds-monitor-weekend',
    timeZone: 'America/El_Salvador',
  })
  async monitorOddsWeekend(): Promise<void> {
    this.logger.debug('Running weekend odds monitor...')
    await this.monitorOdds()
  }

  /**
   * Every 30 minutes from 10 AM to 3 PM on Tuesday, Wednesday, Thursday
   * (Champions League and Europa League match days)
   */
  @Cron('*/30 10-15 * * 2,3,4', {
    name: 'betting-odds-monitor-midweek',
    timeZone: 'America/El_Salvador',
  })
  async monitorOddsMidweek(): Promise<void> {
    this.logger.debug('Running midweek odds monitor...')
    await this.monitorOdds()
  }

  /**
   * Core odds monitoring logic
   */
  private async monitorOdds(): Promise<void> {
    this.logger.debug('Running odds monitor...')

    try {
      // Check if betting is active
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.isActive) {
        return
      }

      // Get active/pending picks for today
      const now = new Date()
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)

      // Only monitor picks within the next 2 hours
      const upcomingPicks = await this.bettingPickModel
        .find({
          status: { $in: [PickStatus.PENDING, PickStatus.ACTIVE] },
          kickoff: {
            $gte: now,
            $lte: twoHoursFromNow,
          },
        })
        .exec()

      if (upcomingPicks.length === 0) {
        return
      }

      this.logger.debug(`Monitoring ${upcomingPicks.length} upcoming picks`)

      for (const pick of upcomingPicks) {
        try {
          await this.checkOddsForPick(pick)
        } catch (error) {
          this.logger.error(`Error monitoring pick ${pick._id}: ${error}`)
        }
      }
    } catch (error) {
      this.logger.error(`Odds monitor failed: ${error}`)
    }
  }

  /**
   * Check odds changes for a single pick
   */
  private async checkOddsForPick(pick: BettingPickDocument): Promise<void> {
    const currentOdds = await this.apiFootballService.getOdds(pick.fixtureId)

    if (!currentOdds) {
      return
    }

    const newOdds = this.findOddsForPick(currentOdds, pick)

    if (!newOdds) {
      return
    }

    const referenceOdds = pick.oddsAtBet || pick.oddsAtDetection || 0
    if (referenceOdds === 0) {
      return
    }

    const oddsChange = (newOdds - referenceOdds) / referenceOdds

    // Detect significant late steam move
    if (
      Math.abs(oddsChange) >= this.SIGNIFICANT_CHANGE &&
      !pick.steamMove?.detected
    ) {
      const direction: SteamMoveDirection =
        oddsChange < 0
          ? SteamMoveDirection.FAVORABLE
          : SteamMoveDirection.CONTRA

      await this.bettingPickModel.updateOne(
        { _id: pick._id },
        {
          $set: {
            'steamMove.detected': true,
            'steamMove.direction': direction,
            'steamMove.pctChange': oddsChange * 100,
            'steamMove.timestamp': new Date(),
          },
        }
      )

      this.logger.log(
        `Late steam move detected: ${pick.teamHome.name} vs ${pick.teamAway.name} - ` +
          `${String(pick.market)} ${(oddsChange * 100).toFixed(1)}% (${direction})`
      )

      // Send immediate Telegram notification for steam moves
      await this.telegramService.sendSteamMoveAlert(pick, direction, oddsChange * 100)
    }

    // Calculate pre-match CLV (Closing Line Value preview)
    const probImplied = 1 / newOdds
    const newEdge = pick.probOwn - probImplied

    // Log if edge improved significantly
    if (newEdge > pick.edge + 0.02) {
      this.logger.log(
        `Edge improved for ${pick.teamHome.name} vs ${pick.teamAway.name}: ` +
          `${(pick.edge * 100).toFixed(1)}% → ${(newEdge * 100).toFixed(1)}%`
      )
    }
  }

  /**
   * Find current odds for a specific pick
   */
  private findOddsForPick(odds: any, pick: BettingPickDocument): number | null {
    if (!odds?.bookmakers) return null

    const marketStr = String(pick.market).toLowerCase()
    const isGoals = marketStr.includes('goal') || marketStr.includes('1h')
    const isCorners = marketStr.includes('corner')

    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        const marketName = market.marketName.toLowerCase()

        if (isGoals && marketName.includes('goals') && marketName.includes('half')) {
          for (const value of market.values) {
            const valueName = value.name.toLowerCase()
            if (
              valueName.includes(pick.direction.toLowerCase()) &&
              valueName.includes(String(pick.line))
            ) {
              return value.odds
            }
          }
        }

        if (isCorners && marketName.includes('corner')) {
          for (const value of market.values) {
            const valueName = value.name.toLowerCase()
            if (
              valueName.includes(pick.direction.toLowerCase()) &&
              valueName.includes(String(pick.line))
            ) {
              return value.odds
            }
          }
        }
      }
    }

    return null
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualMonitor(): Promise<{ monitored: number }> {
    this.logger.log('Manual odds monitor triggered')

    const now = new Date()
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000)

    const picks = await this.bettingPickModel
      .find({
        status: { $in: [PickStatus.PENDING, PickStatus.ACTIVE] },
        kickoff: {
          $gte: now,
          $lte: fourHoursFromNow,
        },
      })
      .exec()

    for (const pick of picks) {
      await this.checkOddsForPick(pick)
    }

    return { monitored: picks.length }
  }
}
