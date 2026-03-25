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
 * Runs every 30 minutes to check for finished matches
 *
 * Purpose:
 * - Collect match results from API-Football
 * - Calculate CLV (Closing Line Value)
 * - Update pick statuses (WON/LOST/VOID)
 * - Update combo statuses
 * - Calculate profit/loss
 * - Update bankroll
 * - Send personal result notifications immediately when matches finish
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
   * Smart Result Collector - Runs every 30 minutes
   * Checks for finished matches and settles picks immediately
   * Sends personal notifications as soon as results are available
   */
  @Cron('*/30 * * * *', {
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

      // Get ACTIVE picks where kickoff was at least 2 hours ago (match should be finished)
      // This ensures we only check matches that have likely concluded
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

      const activePicks = await this.bettingPickModel
        .find({
          status: PickStatus.ACTIVE,
          kickoff: { $lte: twoHoursAgo }, // Match started at least 2 hours ago
        })
        .exec()

      this.logger.log(`Found ${activePicks.length} active picks to settle`)

      let won = 0
      let lost = 0
      let voided = 0
      let totalProfit = 0 // System total profit (all picks)
      let personalProfit = 0 // Personal profit (only betPlaced=true)

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

          // Track personal profit and send notification only for bets user actually placed
          if (pick.betPlaced && result.status !== PickStatus.VOID) {
            personalProfit += result.profit

            // Get the updated pick with match result
            const updatedPick = await this.bettingPickModel.findById(pick._id).exec()
            if (updatedPick) {
              await this.telegramService.sendPersonalResultNotification(
                updatedPick,
                result.profit
              )
            }
          }
        } catch (error) {
          this.logger.error(`Failed to settle pick ${pick._id}: ${error}`)
        }
      }

      // Settle combos
      const comboResults = await this.settleCombos()

      // Update bankroll ONLY with personal profit (bets user actually placed)
      if (personalProfit !== 0) {
        const newBankroll = settings.bankroll + personalProfit
        await this.bettingSettingsModel.updateOne(
          { _id: settings._id },
          { $set: { bankroll: newBankroll } }
        )
        this.logger.log(
          `Bankroll updated (personal bets only): $${settings.bankroll.toFixed(2)} → $${newBankroll.toFixed(2)}`
        )
      }

      this.logger.log(
        `System profit: $${totalProfit.toFixed(2)}, Personal profit: $${personalProfit.toFixed(2)}`
      )

      // Note: Daily summary alert is sent separately at 11 PM via sendDailySummary()
      // The 30-minute cron only settles picks and sends personal notifications

      // ================================================
      // MODEL CALIBRATION VALIDATION (Phase 5)
      // ================================================
      // Analyze all historical settled picks for CLV validation
      // This helps determine if our model is generating real edge
      const allHistoricalPicks = await this.bettingPickModel
        .find({
          status: { $in: [PickStatus.WON, PickStatus.LOST] },
        })
        .sort({ kickoff: -1 })
        .limit(100) // Last 100 picks for calibration
        .exec()

      if (allHistoricalPicks.length >= 20) {
        const calibration = await this.validateModelCalibration(allHistoricalPicks)
        this.logger.log(`Model Calibration: ${calibration.recommendation}`)

        // If model is invalid, log a critical warning
        if (!calibration.isModelValid && allHistoricalPicks.length >= 50) {
          this.logger.error(
            `CRITICAL: Model calibration FAILED. avgCLV=${(calibration.avgCLV * 100).toFixed(2)}%. ` +
            `Recommendation: ${calibration.recommendation}`
          )
        }
      }

      const duration = Date.now() - startTime
      this.logger.log(
        `Result collection completed in ${duration}ms: ` +
          `${won}W ${lost}L ${voided}V, system profit: $${totalProfit.toFixed(2)}, personal profit: $${personalProfit.toFixed(2)}`
      )
    } catch (error) {
      this.logger.error(`Result collection failed: ${error}`)
    }
  }

  /**
   * Daily Summary - Runs once at 11:00 PM El Salvador
   * Sends the daily results summary to Telegram
   */
  @Cron('0 23 * * *', {
    name: 'betting-daily-summary',
    timeZone: 'America/El_Salvador',
  })
  async sendDailySummary(): Promise<void> {
    this.logger.log('Sending daily results summary...')

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      // Get all settled picks for today
      const settledPicks = await this.bettingPickModel
        .find({
          kickoff: { $gte: today, $lt: tomorrow },
          status: { $in: [PickStatus.WON, PickStatus.LOST, PickStatus.VOID] },
        })
        .exec()

      // Get all settled combos
      const settledCombos = await this.bettingComboModel
        .find({
          date: { $gte: today, $lt: tomorrow },
          status: { $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL] },
        })
        .exec()

      if (settledPicks.length > 0 || settledCombos.length > 0) {
        await this.telegramService.sendResultsAlert(today, settledPicks, settledCombos)
        this.logger.log(
          `Daily summary sent: ${settledPicks.length} picks, ${settledCombos.length} combos`
        )
      } else {
        this.logger.log('No settled picks/combos for today - skipping daily summary')
      }
    } catch (error) {
      this.logger.error(`Daily summary failed: ${error}`)
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

    // Check if match is finished (regular time, extra time, or penalties)
    const finishedStatuses = ['FT', 'AET', 'PEN']
    if (!fixtureStats || !finishedStatuses.includes(fixtureStats.status)) {
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
   * Validate model calibration using CLV data
   * This analyzes settled picks to determine if our model is generating real edge
   *
   * CLV (Closing Line Value) measures if we're betting on the right side:
   * - Positive CLV = we got better odds than closing line = good bets
   * - Negative CLV = we got worse odds than closing line = chasing bad lines
   *
   * @param settledPicks Array of picks that have been settled
   */
  async validateModelCalibration(settledPicks: BettingPickDocument[]): Promise<{
    avgCLV: number
    clvPositiveRate: number
    isModelValid: boolean
    recommendation: string
    details: {
      totalPicks: number
      picksWithCLV: number
      avgEdgeAtBet: number
      actualWinRate: number
      expectedWinRate: number
    }
  }> {
    // Filter picks that have CLV data
    const picksWithCLV = settledPicks.filter(
      (p) => p.clv !== undefined && p.clv !== null
    )

    if (picksWithCLV.length === 0) {
      return {
        avgCLV: 0,
        clvPositiveRate: 0,
        isModelValid: false,
        recommendation: 'Insufficient data - no CLV values recorded',
        details: {
          totalPicks: settledPicks.length,
          picksWithCLV: 0,
          avgEdgeAtBet: 0,
          actualWinRate: 0,
          expectedWinRate: 0,
        },
      }
    }

    // Calculate average CLV
    const clvValues = picksWithCLV.map((p) => p.clv || 0)
    const avgCLV = clvValues.reduce((a, b) => a + b, 0) / clvValues.length

    // Calculate CLV positive rate (% of picks with positive CLV)
    const positiveCLVCount = clvValues.filter((c) => c > 0).length
    const clvPositiveRate = positiveCLVCount / clvValues.length

    // Calculate actual win rate
    const wonPicks = settledPicks.filter((p) => p.status === PickStatus.WON)
    const actualWinRate = settledPicks.length > 0
      ? wonPicks.length / settledPicks.length
      : 0

    // Calculate expected win rate (average probOwn)
    const avgProbOwn = settledPicks.reduce((sum, p) => sum + (p.probOwn || 0), 0) /
      settledPicks.length

    // Calculate average edge at bet time
    const avgEdgeAtBet = settledPicks.reduce((sum, p) => sum + (p.edge || 0), 0) /
      settledPicks.length

    // Determine model validity and recommendation
    let isModelValid: boolean
    let recommendation: string

    if (picksWithCLV.length < 30) {
      isModelValid = avgCLV > -0.01 // Allow slight negative CLV with small sample
      recommendation = avgCLV > 0
        ? 'Early indicators positive. Continue data collection (need 50+ picks)'
        : 'Early indicators neutral/negative. Monitor closely'
    } else if (avgCLV > 0.02) {
      isModelValid = true
      recommendation = 'Model VALID. Strong positive CLV indicates real edge. Continue betting'
    } else if (avgCLV > 0) {
      isModelValid = true
      recommendation = 'Model MARGINAL. Positive CLV but low. Consider reducing stakes or reviewing edge thresholds'
    } else if (avgCLV > -0.01) {
      isModelValid = false
      recommendation = 'Model BORDERLINE. CLV near zero. Pause and recalibrate before continuing'
    } else {
      isModelValid = false
      recommendation = 'Model INVALID. Negative CLV indicates chasing bad lines. STOP betting and recalibrate'
    }

    // Log the analysis
    this.logger.log(
      `Model Calibration: avgCLV=${(avgCLV * 100).toFixed(2)}%, ` +
      `CLV+ rate=${(clvPositiveRate * 100).toFixed(1)}%, ` +
      `actual win=${(actualWinRate * 100).toFixed(1)}% vs expected=${(avgProbOwn * 100).toFixed(1)}%`
    )

    return {
      avgCLV,
      clvPositiveRate,
      isModelValid,
      recommendation,
      details: {
        totalPicks: settledPicks.length,
        picksWithCLV: picksWithCLV.length,
        avgEdgeAtBet,
        actualWinRate,
        expectedWinRate: avgProbOwn,
      },
    }
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualCollection(): Promise<{
    picks: { won: number; lost: number; voided: number }
    combos: { won: number; lost: number; partial: number }
    systemProfit: number
    personalProfit: number
  }> {
    this.logger.log('Manual result collection triggered')

    const settings = await this.bettingSettingsModel.findOne().exec()
    if (!settings) {
      return {
        picks: { won: 0, lost: 0, voided: 0 },
        combos: { won: 0, lost: 0, partial: 0 },
        systemProfit: 0,
        personalProfit: 0,
      }
    }

    // Get ACTIVE picks where kickoff was at least 2 hours ago
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

    const activePicks = await this.bettingPickModel
      .find({
        status: PickStatus.ACTIVE,
        kickoff: { $lte: twoHoursAgo },
      })
      .exec()

    let won = 0
    let lost = 0
    let voided = 0
    let systemProfit = 0
    let personalProfit = 0

    for (const pick of activePicks) {
      const result = await this.settlePick(pick, settings.bankroll)
      if (result.status === PickStatus.WON) won++
      else if (result.status === PickStatus.LOST) lost++
      else if (result.status === PickStatus.VOID) voided++
      systemProfit += result.profit

      // Track personal profit and send notification only for bets user actually placed
      if (pick.betPlaced && result.status !== PickStatus.VOID) {
        personalProfit += result.profit

        const updatedPick = await this.bettingPickModel.findById(pick._id).exec()
        if (updatedPick) {
          await this.telegramService.sendPersonalResultNotification(
            updatedPick,
            result.profit
          )
        }
      }
    }

    const comboResults = await this.settleCombos()

    // Update bankroll only with personal profit
    if (personalProfit !== 0) {
      const newBankroll = settings.bankroll + personalProfit
      await this.bettingSettingsModel.updateOne(
        { _id: settings._id },
        { $set: { bankroll: newBankroll } }
      )
    }

    return {
      picks: { won, lost, voided },
      combos: comboResults,
      systemProfit,
      personalProfit,
    }
  }
}
