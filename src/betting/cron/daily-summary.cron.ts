import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import { BettingCombo, BettingComboDocument } from '../schemas/betting-combo.schema'
import {
  BettingDailySummary,
  BettingDailySummaryDocument,
} from '../schemas/betting-daily-summary.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import { PickStatus, ComboStatus } from '../enums/betting.enums'

/**
 * Daily Summary Cron Job
 * Runs every night at 11:00 PM El Salvador time
 *
 * Purpose:
 * - Generate daily summary statistics
 * - Calculate daily profit/loss
 * - Track CLV and edge metrics
 * - Save to betting_daily_summary collection
 */
@Injectable()
export class DailySummaryCron {
  private readonly logger = new Logger(DailySummaryCron.name)

  constructor(
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingDailySummary.name)
    private dailySummaryModel: Model<BettingDailySummaryDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>
  ) {}

  /**
   * Every night at 11:00 PM El Salvador
   */
  @Cron('0 23 * * *', {
    name: 'betting-daily-summary',
    timeZone: 'America/El_Salvador',
  })
  async generateDailySummary(): Promise<void> {
    this.logger.log('Generating daily summary...')

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      // Check if summary already exists for today
      const existingSummary = await this.dailySummaryModel.findOne({
        date: today,
      })
      if (existingSummary) {
        this.logger.log('Daily summary already exists for today, updating...')
      }

      // Get all picks for today
      const picks = await this.bettingPickModel
        .find({
          date: { $gte: today, $lt: tomorrow },
          status: { $in: [PickStatus.WON, PickStatus.LOST, PickStatus.VOID] },
        })
        .exec()

      // Get all combos for today
      const combos = await this.bettingComboModel
        .find({
          createdAt: { $gte: today, $lt: tomorrow },
          status: {
            $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL],
          },
        })
        .exec()

      // Calculate pick stats
      const pickStats = this.calculatePickStats(picks)

      // Calculate combo stats
      const comboStats = this.calculateComboStats(combos)

      // Calculate total profit
      const totalProfit = pickStats.profit + comboStats.profit

      // Calculate total staked
      const totalStaked = pickStats.staked + comboStats.staked

      // Get current settings
      const settings = await this.bettingSettingsModel.findOne().exec()
      const currentBankroll = settings?.bankroll || 100

      // Calculate league performance
      const byLeague = this.calculateLeaguePerformance(picks)

      // Calculate combo type performance
      const byComboType = this.calculateComboTypePerformance(combos)

      // Create or update summary
      const summaryData = {
        date: today,
        // Picks
        totalPicks: picks.length,
        picksWon: pickStats.won,
        picksLost: pickStats.lost,
        picksVoid: pickStats.void,
        picksCancelled: 0,
        // Combos
        totalCombos: combos.length,
        combosWon: comboStats.won,
        combosLost: comboStats.lost,
        // Financial
        totalStaked,
        totalProfit,
        bankrollBefore: currentBankroll - totalProfit,
        bankrollAfter: currentBankroll,
        // Metrics
        avgCLV: pickStats.avgClv,
        avgEdge: pickStats.avgEdge,
        avgConfidence: pickStats.avgConfidence,
        // Breakdowns
        byMarket: {
          goals_1h: {
            count: pickStats.byMarket.goals.count,
            won: pickStats.byMarket.goals.won,
            profit: pickStats.byMarket.goals.profit,
            avgCLV: pickStats.byMarket.goals.avgCLV,
          },
          corners: {
            count: pickStats.byMarket.corners.count,
            won: pickStats.byMarket.corners.won,
            profit: pickStats.byMarket.corners.profit,
            avgCLV: pickStats.byMarket.corners.avgCLV,
          },
        },
        byLeague,
        byComboType,
      }

      if (existingSummary) {
        await this.dailySummaryModel.updateOne(
          { _id: existingSummary._id },
          { $set: summaryData }
        )
      } else {
        await this.dailySummaryModel.create(summaryData)
      }

      const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0

      this.logger.log(
        `Daily summary generated: ${picks.length} picks, ${combos.length} combos, ` +
          `profit: $${totalProfit.toFixed(2)}, ROI: ${roi.toFixed(1)}%`
      )
    } catch (error) {
      this.logger.error(`Daily summary failed: ${error}`)
    }
  }

  /**
   * Calculate statistics for picks
   */
  private calculatePickStats(picks: BettingPickDocument[]): {
    won: number
    lost: number
    void: number
    profit: number
    staked: number
    avgEdge: number
    avgClv: number
    avgConfidence: number
    byMarket: {
      goals: { count: number; won: number; profit: number; avgCLV: number }
      corners: { count: number; won: number; profit: number; avgCLV: number }
    }
  } {
    const result = {
      won: 0,
      lost: 0,
      void: 0,
      profit: 0,
      staked: 0,
      avgEdge: 0,
      avgClv: 0,
      avgConfidence: 0,
      byMarket: {
        goals: { count: 0, won: 0, profit: 0, avgCLV: 0, totalCLV: 0 },
        corners: { count: 0, won: 0, profit: 0, avgCLV: 0, totalCLV: 0 },
      },
    }

    if (picks.length === 0) {
      return {
        ...result,
        byMarket: {
          goals: { count: 0, won: 0, profit: 0, avgCLV: 0 },
          corners: { count: 0, won: 0, profit: 0, avgCLV: 0 },
        },
      }
    }

    let totalEdge = 0
    let totalClv = 0
    let totalConfidence = 0

    for (const pick of picks) {
      if (pick.status === PickStatus.WON) result.won++
      else if (pick.status === PickStatus.LOST) result.lost++
      else if (pick.status === PickStatus.VOID) result.void++

      result.profit += pick.profit || 0
      result.staked += pick.stake || 0
      totalEdge += pick.edge || 0
      totalClv += pick.clv || 0
      totalConfidence += pick.confidenceScore || 0

      const marketStr = String(pick.market).toLowerCase()
      if (marketStr.includes('goal') || marketStr.includes('1h')) {
        result.byMarket.goals.count++
        result.byMarket.goals.profit += pick.profit || 0
        result.byMarket.goals.totalCLV += pick.clv || 0
        if (pick.status === PickStatus.WON) result.byMarket.goals.won++
      } else if (marketStr.includes('corner')) {
        result.byMarket.corners.count++
        result.byMarket.corners.profit += pick.profit || 0
        result.byMarket.corners.totalCLV += pick.clv || 0
        if (pick.status === PickStatus.WON) result.byMarket.corners.won++
      }
    }

    result.avgEdge = totalEdge / picks.length
    result.avgClv = totalClv / picks.length
    result.avgConfidence = totalConfidence / picks.length

    // Calculate avgCLV for each market
    const goalsAvgCLV =
      result.byMarket.goals.count > 0
        ? result.byMarket.goals.totalCLV / result.byMarket.goals.count
        : 0
    const cornersAvgCLV =
      result.byMarket.corners.count > 0
        ? result.byMarket.corners.totalCLV / result.byMarket.corners.count
        : 0

    return {
      won: result.won,
      lost: result.lost,
      void: result.void,
      profit: result.profit,
      staked: result.staked,
      avgEdge: result.avgEdge,
      avgClv: result.avgClv,
      avgConfidence: result.avgConfidence,
      byMarket: {
        goals: {
          count: result.byMarket.goals.count,
          won: result.byMarket.goals.won,
          profit: result.byMarket.goals.profit,
          avgCLV: goalsAvgCLV,
        },
        corners: {
          count: result.byMarket.corners.count,
          won: result.byMarket.corners.won,
          profit: result.byMarket.corners.profit,
          avgCLV: cornersAvgCLV,
        },
      },
    }
  }

  /**
   * Calculate statistics for combos
   */
  private calculateComboStats(combos: BettingComboDocument[]): {
    won: number
    lost: number
    profit: number
    staked: number
  } {
    const result = {
      won: 0,
      lost: 0,
      profit: 0,
      staked: 0,
    }

    for (const combo of combos) {
      if (combo.status === ComboStatus.WON) result.won++
      else if (combo.status === ComboStatus.LOST) result.lost++

      result.profit += combo.profit || 0
      result.staked += combo.stake || 0
    }

    return result
  }

  /**
   * Calculate league performance breakdown
   */
  private calculateLeaguePerformance(
    picks: BettingPickDocument[]
  ): Array<{
    leagueId: number
    leagueName: string
    count: number
    won: number
    profit: number
  }> {
    const leagueMap = new Map<
      number,
      { leagueName: string; count: number; won: number; profit: number }
    >()

    for (const pick of picks) {
      const leagueId = pick.league.id
      const existing = leagueMap.get(leagueId) || {
        leagueName: pick.league.name,
        count: 0,
        won: 0,
        profit: 0,
      }

      existing.count++
      existing.profit += pick.profit || 0
      if (pick.status === PickStatus.WON) existing.won++

      leagueMap.set(leagueId, existing)
    }

    return Array.from(leagueMap.entries()).map(([leagueId, stats]) => ({
      leagueId,
      leagueName: stats.leagueName,
      count: stats.count,
      won: stats.won,
      profit: stats.profit,
    }))
  }

  /**
   * Calculate combo type performance breakdown
   */
  private calculateComboTypePerformance(
    combos: BettingComboDocument[]
  ): Array<{
    type: string
    count: number
    won: number
    profit: number
    avgHiddenEdge: number
  }> {
    const typeMap = new Map<
      string,
      { count: number; won: number; profit: number; totalHiddenEdge: number }
    >()

    for (const combo of combos) {
      const type = String(combo.type)
      const existing = typeMap.get(type) || {
        count: 0,
        won: 0,
        profit: 0,
        totalHiddenEdge: 0,
      }

      existing.count++
      existing.profit += combo.profit || 0
      existing.totalHiddenEdge += combo.hiddenEdge || 0
      if (combo.status === ComboStatus.WON) existing.won++

      typeMap.set(type, existing)
    }

    return Array.from(typeMap.entries()).map(([type, stats]) => ({
      type,
      count: stats.count,
      won: stats.won,
      profit: stats.profit,
      avgHiddenEdge: stats.count > 0 ? stats.totalHiddenEdge / stats.count : 0,
    }))
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualSummary(): Promise<{
    picks: number
    combos: number
    profit: number
    roi: number
  }> {
    this.logger.log('Manual daily summary triggered')
    await this.generateDailySummary()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const summary = await this.dailySummaryModel.findOne({ date: today })

    const roi =
      summary && summary.totalStaked > 0
        ? summary.totalProfit / summary.totalStaked
        : 0

    return {
      picks: summary?.totalPicks || 0,
      combos: summary?.totalCombos || 0,
      profit: summary?.totalProfit || 0,
      roi,
    }
  }
}
