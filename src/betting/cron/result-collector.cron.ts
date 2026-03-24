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
import { PickStatus, ComboStatus } from '../enums/betting.enums'

/**
 * Result Collector Cron Job
 * Runs Saturday at 3:00 PM El Salvador time
 *
 * Purpose:
 * - Collect match results from API-Football
 * - Calculate CLV (Closing Line Value)
 * - Update pick statuses (WON/LOST/VOID)
 * - Update combo statuses
 * - Calculate profit/loss
 * - Update bankroll
 * - Send Alert 3 to Telegram
 */
@Injectable()
export class ResultCollectorCron {
  private readonly logger = new Logger(ResultCollectorCron.name)

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

  /**
   * Daily at 11:00 PM El Salvador - Collect results
   * Runs every day to catch all matches (weekday and weekend)
   */
  @Cron('0 23 * * *', {
    name: 'betting-result-collector',
    timeZone: 'America/El_Salvador',
  })
  async collectResults(): Promise<void> {
    this.logger.log('Starting result collection...')
    const startTime = Date.now()

    try {
      // Get settings
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings) {
        this.logger.error('No betting settings found')
        return
      }

      // Get today's picks that need results
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const activePicks = await this.bettingPickModel
        .find({
          status: PickStatus.ACTIVE,
          kickoff: { $gte: today, $lt: tomorrow },
        })
        .exec()

      this.logger.log(`Found ${activePicks.length} active picks to settle`)

      let won = 0
      let lost = 0
      let voided = 0
      let totalProfit = 0

      for (const pick of activePicks) {
        try {
          const result = await this.settlePick(pick, settings.bankroll)

          if (result.status === PickStatus.WON) {
            won++
            totalProfit += result.profit
          } else if (result.status === PickStatus.LOST) {
            lost++
            totalProfit += result.profit
          } else if (result.status === PickStatus.VOID) {
            voided++
          }
        } catch (error) {
          this.logger.error(`Failed to settle pick ${pick._id}: ${error}`)
        }
      }

      // Settle combos
      const comboResults = await this.settleCombos()

      // Update bankroll
      if (totalProfit !== 0) {
        const newBankroll = settings.bankroll + totalProfit
        await this.bettingSettingsModel.updateOne(
          { _id: settings._id },
          { $set: { bankroll: newBankroll } }
        )
        this.logger.log(
          `Bankroll updated: $${settings.bankroll.toFixed(2)} → $${newBankroll.toFixed(2)}`
        )
      }

      // Send Telegram Alert 3: Daily Results
      const settledPicks = await this.bettingPickModel
        .find({
          kickoff: { $gte: today, $lt: tomorrow },
          status: { $in: [PickStatus.WON, PickStatus.LOST, PickStatus.VOID] },
        })
        .exec()

      const settledCombos = await this.bettingComboModel
        .find({
          status: { $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL] },
        })
        .exec()

      await this.telegramService.sendResultsAlert(today, settledPicks, settledCombos)

      const duration = Date.now() - startTime
      this.logger.log(
        `Result collection completed in ${duration}ms: ` +
          `${won}W ${lost}L ${voided}V, profit: $${totalProfit.toFixed(2)}`
      )
    } catch (error) {
      this.logger.error(`Result collection failed: ${error}`)
    }
  }

  /**
   * Settle a single pick
   */
  private async settlePick(
    pick: BettingPickDocument,
    bankroll: number
  ): Promise<{
    status: PickStatus
    profit: number
  }> {
    // Get fixture stats
    const fixtureStats = await this.apiFootballService.getFixtureStats(
      pick.fixtureId
    )

    if (!fixtureStats || fixtureStats.status !== 'FT') {
      // Match not finished yet
      return { status: pick.status, profit: 0 }
    }

    // Determine if pick won
    const marketStr = String(pick.market).toLowerCase()
    let pickWon = false
    let actualValue: number | undefined

    if (marketStr.includes('goal') || marketStr.includes('1h')) {
      // Goals 1H market
      const goals1H = fixtureStats.homeGoals1H + fixtureStats.awayGoals1H
      actualValue = goals1H

      if (pick.direction === 'OVER') {
        pickWon = goals1H > pick.line
      } else {
        pickWon = goals1H < pick.line
      }
    } else if (marketStr.includes('corner')) {
      // Corners market
      const totalCorners =
        (fixtureStats.homeCorners ?? 0) + (fixtureStats.awayCorners ?? 0)
      actualValue = totalCorners

      if (pick.direction === 'OVER') {
        pickWon = totalCorners > pick.line
      } else {
        pickWon = totalCorners < pick.line
      }
    }

    // Calculate profit/loss
    const stake = pick.stake || 0
    const odds = pick.oddsAtBet || pick.oddsAtDetection || 0
    const profit = pickWon ? stake * (odds - 1) : -stake

    // Calculate CLV (Closing Line Value)
    const closingOdds = pick.oddsAtClose || odds
    const clv = closingOdds > 0 ? (1 / closingOdds - 1 / odds) : 0

    // Determine final status
    let status = pickWon ? PickStatus.WON : PickStatus.LOST

    // Check for void (push)
    if (actualValue === pick.line) {
      status = PickStatus.VOID
    }

    // Update pick
    await this.bettingPickModel.updateOne(
      { _id: pick._id },
      {
        $set: {
          status,
          profit,
          clv,
          'matchResult.scoreHT': `${fixtureStats.homeGoals1H}-${fixtureStats.awayGoals1H}`,
          'matchResult.scoreFT': `${fixtureStats.homeGoals}-${fixtureStats.awayGoals}`,
          'matchResult.cornersTotal':
            (fixtureStats.homeCorners ?? 0) + (fixtureStats.awayCorners ?? 0),
          'matchResult.cornersHome': fixtureStats.homeCorners,
          'matchResult.cornersAway': fixtureStats.awayCorners,
        },
      }
    )

    this.logger.log(
      `Settled pick ${pick.teamHome.name} vs ${pick.teamAway.name}: ` +
        `${status} (${pickWon ? '+' : ''}$${profit.toFixed(2)}), ` +
        `CLV: ${(clv * 100).toFixed(1)}%`
    )

    return { status, profit }
  }

  /**
   * Settle all pending combos
   */
  private async settleCombos(): Promise<{
    won: number
    lost: number
    partial: number
  }> {
    const pendingCombos = await this.bettingComboModel
      .find({ status: { $in: [PickStatus.PENDING, PickStatus.ACTIVE] } })
      .exec()

    let won = 0
    let lost = 0
    let partial = 0

    for (const combo of pendingCombos) {
      try {
        const result = await this.settleCombo(combo)

        if (result === ComboStatus.WON) won++
        else if (result === ComboStatus.LOST) lost++
        else if (result === ComboStatus.PARTIAL) partial++
      } catch (error) {
        this.logger.error(`Failed to settle combo ${combo._id}: ${error}`)
      }
    }

    return { won, lost, partial }
  }

  /**
   * Settle a single combo
   */
  private async settleCombo(combo: BettingComboDocument): Promise<ComboStatus> {
    // Get all leg fixture IDs
    const legFixtureIds = combo.legs.map((l: any) => l.fixtureId)

    // Get picks for these fixtures
    const picks = await this.bettingPickModel
      .find({ fixtureId: { $in: legFixtureIds } })
      .exec()

    // Check if all picks are settled
    const allSettled = picks.every(
      (p) =>
        p.status === PickStatus.WON ||
        p.status === PickStatus.LOST ||
        p.status === PickStatus.VOID
    )

    if (!allSettled) {
      return combo.status as ComboStatus
    }

    // Determine combo result
    const anyLost = picks.some((p) => p.status === PickStatus.LOST)
    const allWon = picks.every(
      (p) => p.status === PickStatus.WON || p.status === PickStatus.VOID
    )
    const hasVoid = picks.some((p) => p.status === PickStatus.VOID)

    let status: ComboStatus
    let profit = 0

    if (anyLost) {
      status = ComboStatus.LOST
      profit = -(combo.stake || 0)
    } else if (allWon) {
      status = ComboStatus.WON
      // Recalculate odds excluding voided legs
      const effectiveOdds = picks
        .filter((p) => p.status === PickStatus.WON)
        .reduce((acc, p) => acc * (p.oddsAtBet || p.oddsAtDetection || 1), 1)
      profit = (combo.stake || 0) * (effectiveOdds - 1)

      if (hasVoid) {
        status = ComboStatus.PARTIAL
      }
    } else {
      status = ComboStatus.PENDING
    }

    // Update combo
    await this.bettingComboModel.updateOne(
      { _id: combo._id },
      {
        $set: {
          status,
          profit,
        },
      }
    )

    this.logger.log(
      `Settled combo ${combo._id}: ${status} ($${profit.toFixed(2)})`
    )

    return status
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualCollection(): Promise<{
    picks: { won: number; lost: number; voided: number }
    combos: { won: number; lost: number; partial: number }
    profit: number
  }> {
    this.logger.log('Manual result collection triggered')

    const settings = await this.bettingSettingsModel.findOne().exec()
    if (!settings) {
      return {
        picks: { won: 0, lost: 0, voided: 0 },
        combos: { won: 0, lost: 0, partial: 0 },
        profit: 0,
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const activePicks = await this.bettingPickModel
      .find({
        status: PickStatus.ACTIVE,
        kickoff: { $gte: today, $lt: tomorrow },
      })
      .exec()

    let won = 0
    let lost = 0
    let voided = 0
    let totalProfit = 0

    for (const pick of activePicks) {
      const result = await this.settlePick(pick, settings.bankroll)
      if (result.status === PickStatus.WON) won++
      else if (result.status === PickStatus.LOST) lost++
      else if (result.status === PickStatus.VOID) voided++
      totalProfit += result.profit
    }

    const comboResults = await this.settleCombos()

    return {
      picks: { won, lost, voided },
      combos: comboResults,
      profit: totalProfit,
    }
  }
}
