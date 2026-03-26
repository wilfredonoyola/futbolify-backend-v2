import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import { BettingCombo, BettingComboDocument } from '../schemas/betting-combo.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import { ApiFootballBettingService } from '../services/api-football-betting.service'
import { BettingTelegramService } from '../telegram/betting-telegram.service'
import { PickStatus, ComboStatus, SteamMoveDirection } from '../enums/betting.enums'

/**
 * Pre-Match Check Cron Job
 * Runs on match days at appropriate times El Salvador
 *
 * Schedule:
 * - Saturday 6:30 AM → Verify Saturday picks (VENTANA A + B)
 * - Sunday 6:30 AM → Verify Sunday picks (VENTANA C)
 * - Tuesday 10:00 AM → Verify Tuesday picks (Champions League)
 * - Wednesday 10:00 AM → Verify Wednesday picks (Champions League)
 * - Thursday 8:00 AM → Verify Thursday picks (Europa League)
 *
 * Purpose:
 * - Verify odds changes since nightly analysis
 * - Detect steam moves (sharp money indicators)
 * - Confirm or cancel picks based on edge changes
 * - Update combo status
 * - Send Alert 2 to Telegram
 */
@Injectable()
export class PreMatchCheckCron {
  private readonly logger = new Logger(PreMatchCheckCron.name)

  // Steam move thresholds
  private readonly STEAM_MOVE_THRESHOLD = 0.05 // 5% odds change
  private readonly EDGE_CANCEL_THRESHOLD = 0.02 // Cancel if edge falls below 2%

  constructor(
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    private apiFootballService: ApiFootballBettingService,
    private telegramService: BettingTelegramService
  ) {}

  // ===========================================
  // PRE-MATCH CHECK CRONS DISABLED
  // Steam move alerts handle urgent changes
  // ===========================================

  // /**
  //  * Saturday and Sunday 6:30 AM El Salvador - Weekend pre-match verification
  //  */
  // @Cron('30 6 * * 6,0', {
  //   name: 'betting-pre-match-check-weekend',
  //   timeZone: 'America/El_Salvador',
  // })
  async runWeekendPreMatchCheck(): Promise<void> {
    const dayName = new Date().getDay() === 0 ? 'Sunday' : 'Saturday'
    this.logger.log(`Starting ${dayName} pre-match check...`)
    await this.runPreMatchCheck()
  }

  // /**
  //  * Tuesday and Wednesday 10:00 AM El Salvador - Champions League pre-match
  //  */
  // @Cron('0 10 * * 2,3', {
  //   name: 'betting-pre-match-check-ucl',
  //   timeZone: 'America/El_Salvador',
  // })
  async runChampionsLeaguePreMatchCheck(): Promise<void> {
    const dayName = new Date().getDay() === 2 ? 'Tuesday' : 'Wednesday'
    this.logger.log(`Starting ${dayName} Champions League pre-match check...`)
    await this.runPreMatchCheck()
  }

  // /**
  //  * Thursday 8:00 AM El Salvador - Europa League pre-match
  //  */
  // @Cron('0 8 * * 4', {
  //   name: 'betting-pre-match-check-uel',
  //   timeZone: 'America/El_Salvador',
  // })
  async runEuropaLeaguePreMatchCheck(): Promise<void> {
    this.logger.log('Starting Thursday Europa League pre-match check...')
    await this.runPreMatchCheck()
  }

  /**
   * Core pre-match check logic
   */
  private async runPreMatchCheck(): Promise<void> {
    this.logger.log('Starting pre-match check...')
    const startTime = Date.now()

    try {
      // Check if betting is active
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.isActive) {
        this.logger.log('Betting is paused, skipping pre-match check')
        return
      }

      // Get today's pending picks
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const pendingPicks = await this.bettingPickModel
        .find({
          status: PickStatus.PENDING,
          kickoff: { $gte: today, $lt: tomorrow },
        })
        .exec()

      this.logger.log(`Found ${pendingPicks.length} pending picks to verify`)

      let confirmed = 0
      let cancelled = 0
      let steamDetected = 0

      // Track pick results for Telegram alert
      const pickResults: Array<{
        pick: BettingPickDocument
        status: 'confirmed' | 'steam_favorable' | 'steam_contra' | 'cancelled'
        newOdds?: number
        newEdge?: number
        confidenceChange?: number
        reason?: string
      }> = []

      for (const pick of pendingPicks) {
        try {
          const result = await this.verifyPick(pick)

          if (result.cancelled) {
            cancelled++
            pickResults.push({
              pick,
              status: 'cancelled',
              newOdds: result.newOdds,
              newEdge: result.newEdge,
              reason: `Edge dropped to ${((result.newEdge || 0) * 100).toFixed(1)}%`,
            })
          } else if (result.steamDetected) {
            steamDetected++
            const steamStatus =
              result.steamDirection === SteamMoveDirection.FAVORABLE
                ? 'steam_favorable'
                : 'steam_contra'
            pickResults.push({
              pick,
              status: steamStatus as 'steam_favorable' | 'steam_contra',
              newOdds: result.newOdds,
              newEdge: result.newEdge,
              confidenceChange: result.steamDirection === SteamMoveDirection.FAVORABLE ? 20 : -15,
            })
            confirmed++
          } else {
            confirmed++
            pickResults.push({
              pick,
              status: 'confirmed',
              newOdds: result.newOdds,
              newEdge: result.newEdge,
            })
          }
        } catch (error) {
          this.logger.error(
            `Failed to verify pick ${pick._id}: ${error}`
          )
        }
      }

      // Update combos based on pick changes
      const comboResults = await this.updateCombosAfterVerification()

      // Send Telegram Alert 2: Pre-Match Verification
      await this.telegramService.sendPreMatchAlert(pickResults, comboResults)

      const duration = Date.now() - startTime
      this.logger.log(
        `Pre-match check completed in ${duration}ms: ` +
          `${confirmed} confirmed, ${cancelled} cancelled, ` +
          `${steamDetected} steam moves detected`
      )
    } catch (error) {
      this.logger.error(`Pre-match check failed: ${error}`)
    }
  }

  /**
   * Verify a single pick against current odds
   */
  private async verifyPick(pick: BettingPickDocument): Promise<{
    cancelled: boolean
    steamDetected: boolean
    steamDirection?: SteamMoveDirection
    newOdds?: number
    newEdge?: number
  }> {
    const result: {
      cancelled: boolean
      steamDetected: boolean
      steamDirection?: SteamMoveDirection
      newOdds?: number
      newEdge?: number
    } = { cancelled: false, steamDetected: false }

    // Get current odds
    const currentOdds = await this.apiFootballService.getOdds(pick.fixtureId)

    if (!currentOdds) {
      this.logger.warn(`Could not get odds for fixture ${pick.fixtureId}`)
      return result
    }

    // Find odds for this specific market
    const newOdds = this.findOddsForPick(currentOdds, pick)

    if (!newOdds) {
      return result
    }

    const oddsAtDetection = pick.oddsAtDetection || 0
    const oddsChange = (newOdds - oddsAtDetection) / oddsAtDetection

    // Store new odds for return
    result.newOdds = newOdds

    // Detect steam move
    if (Math.abs(oddsChange) >= this.STEAM_MOVE_THRESHOLD) {
      result.steamDetected = true

      const direction: SteamMoveDirection =
        oddsChange < 0
          ? SteamMoveDirection.FAVORABLE // Odds dropped = money coming in
          : SteamMoveDirection.CONTRA // Odds rose = money going against

      result.steamDirection = direction

      // Update pick with steam move info
      await this.bettingPickModel.updateOne(
        { _id: pick._id },
        {
          $set: {
            'steamMove.detected': true,
            'steamMove.direction': direction,
            'steamMove.pctChange': oddsChange * 100,
            'steamMove.timestamp': new Date(),
            // Adjust confidence based on steam direction
            confidenceScore:
              direction === SteamMoveDirection.FAVORABLE
                ? Math.min(100, pick.confidenceScore + 20)
                : Math.max(0, pick.confidenceScore - 15),
          },
        }
      )

      this.logger.log(
        `Steam move detected for pick ${pick._id}: ` +
          `${(oddsChange * 100).toFixed(1)}% (${direction})`
      )
    }

    // Calculate new edge
    const probImplied = 1 / newOdds
    const newEdge = pick.probOwn - probImplied
    result.newEdge = newEdge

    // Cancel if edge fell below threshold
    if (newEdge < this.EDGE_CANCEL_THRESHOLD) {
      result.cancelled = true

      await this.bettingPickModel.updateOne(
        { _id: pick._id },
        {
          $set: {
            status: PickStatus.CANCELLED,
            edge: newEdge,
          },
        }
      )

      this.logger.log(
        `Cancelled pick ${pick._id}: edge dropped to ${(newEdge * 100).toFixed(1)}%`
      )
    } else {
      // Update with current odds
      await this.bettingPickModel.updateOne(
        { _id: pick._id },
        {
          $set: {
            oddsAtBet: newOdds,
            edge: newEdge,
          },
        }
      )
    }

    return result
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
   * Update combos based on pick verification results
   */
  private async updateCombosAfterVerification(): Promise<
    Array<{
      combo: BettingComboDocument
      status: 'confirmed' | 'cancelled'
      reason?: string
    }>
  > {
    const results: Array<{
      combo: BettingComboDocument
      status: 'confirmed' | 'cancelled'
      reason?: string
    }> = []

    // Find combos with cancelled legs
    const combos = await this.bettingComboModel
      .find({ status: ComboStatus.PENDING })
      .exec()

    for (const combo of combos) {
      // Check if any leg's pick was cancelled
      const legFixtureIds = combo.legs.map((l: any) => l.fixtureId)

      const cancelledPicks = await this.bettingPickModel.countDocuments({
        fixtureId: { $in: legFixtureIds },
        status: PickStatus.CANCELLED,
      })

      if (cancelledPicks > 0) {
        await this.bettingComboModel.updateOne(
          { _id: combo._id },
          {
            $set: { status: ComboStatus.CANCELLED },
            $push: { warnings: 'Cancelled: one or more legs lost value' },
          }
        )

        results.push({
          combo,
          status: 'cancelled',
          reason: `${cancelledPicks} leg(s) lost value`,
        })

        this.logger.log(
          `Cancelled combo ${combo._id}: ${cancelledPicks} leg(s) cancelled`
        )
      } else {
        results.push({
          combo,
          status: 'confirmed',
        })
      }
    }

    return results
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualCheck(): Promise<{
    confirmed: number
    cancelled: number
    steamDetected: number
  }> {
    this.logger.log('Manual pre-match check triggered')

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const pendingPicks = await this.bettingPickModel
      .find({
        status: PickStatus.PENDING,
        kickoff: { $gte: today, $lt: tomorrow },
      })
      .exec()

    let confirmed = 0
    let cancelled = 0
    let steamDetected = 0

    for (const pick of pendingPicks) {
      try {
        const result = await this.verifyPick(pick)
        if (result.cancelled) cancelled++
        else confirmed++
        if (result.steamDetected) steamDetected++
      } catch {
        // Continue with other picks
      }
    }

    await this.updateCombosAfterVerification()

    return { confirmed, cancelled, steamDetected }
  }
}
