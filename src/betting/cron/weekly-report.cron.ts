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
 * Weekly Report Cron Job
 * Runs Monday at 8:00 AM El Salvador time
 *
 * Purpose:
 * - Generate weekly performance report
 * - Calculate weekly CLV, ROI, and profit
 * - Identify best and worst performers
 * - Suggest adjustments if needed
 * - Send report to Telegram
 */
@Injectable()
export class WeeklyReportCron {
  private readonly logger = new Logger(WeeklyReportCron.name)

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
   * Monday 8:00 AM El Salvador - Generate weekly report
   */
  @Cron('0 8 * * 1', {
    name: 'betting-weekly-report',
    timeZone: 'America/El_Salvador',
  })
  async generateWeeklyReport(): Promise<void> {
    this.logger.log('Generating weekly report...')

    try {
      // Calculate date range (last 7 days)
      const endDate = new Date()
      endDate.setHours(0, 0, 0, 0)
      const startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - 7)

      // Get daily summaries for the week
      const dailySummaries = await this.dailySummaryModel
        .find({
          date: { $gte: startDate, $lt: endDate },
        })
        .sort({ date: 1 })
        .exec()

      // Get all picks for the week
      const picks = await this.bettingPickModel
        .find({
          date: { $gte: startDate, $lt: endDate },
          status: { $in: [PickStatus.WON, PickStatus.LOST, PickStatus.VOID] },
        })
        .exec()

      // Get all combos for the week
      const combos = await this.bettingComboModel
        .find({
          createdAt: { $gte: startDate, $lt: endDate },
          status: {
            $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL],
          },
        })
        .exec()

      // Calculate weekly totals
      const weeklyStats = this.calculateWeeklyStats(dailySummaries)

      // Calculate by league
      const leagueStats = this.calculateLeagueStats(picks)

      // Calculate by market
      const marketStats = this.calculateMarketStats(picks)

      // Calculate combo stats
      const comboStats = this.calculateComboTypeStats(combos)

      // Generate suggestions
      const suggestions = this.generateSuggestions(
        weeklyStats,
        leagueStats,
        marketStats
      )

      // Get settings
      const settings = await this.bettingSettingsModel.findOne().exec()

      // Build report
      const report = {
        period: `${this.formatDate(startDate)} - ${this.formatDate(endDate)}`,
        // Summary
        totalPicks: picks.length,
        totalCombos: combos.length,
        totalProfit: weeklyStats.profit,
        roi: weeklyStats.roi,
        avgClv: weeklyStats.avgClv,
        // Win rates
        picksWinRate: weeklyStats.picksWinRate,
        combosWinRate: weeklyStats.combosWinRate,
        // Bankroll
        bankrollStart: weeklyStats.bankrollStart,
        bankrollEnd: settings?.bankroll || 100,
        // Best/Worst
        bestLeague: leagueStats.best,
        worstLeague: leagueStats.worst,
        bestMarket: marketStats.best,
        worstMarket: marketStats.worst,
        bestComboType: comboStats.best,
        // Suggestions
        suggestions,
      }

      this.logger.log(
        `Weekly report generated: ${report.totalPicks} picks, ` +
          `${report.totalCombos} combos, profit: $${report.totalProfit.toFixed(2)}, ` +
          `ROI: ${(report.roi * 100).toFixed(1)}%`
      )

      // Log suggestions
      if (suggestions.length > 0) {
        this.logger.log(`Suggestions: ${suggestions.join('; ')}`)
      }

      // TODO: Send Telegram report (Phase 6)
      // await this.sendTelegramReport(report)
    } catch (error) {
      this.logger.error(`Weekly report failed: ${error}`)
    }
  }

  /**
   * Calculate weekly statistics from daily summaries
   */
  private calculateWeeklyStats(summaries: BettingDailySummaryDocument[]): {
    profit: number
    roi: number
    avgClv: number
    picksWinRate: number
    combosWinRate: number
    bankrollStart: number
  } {
    if (summaries.length === 0) {
      return {
        profit: 0,
        roi: 0,
        avgClv: 0,
        picksWinRate: 0,
        combosWinRate: 0,
        bankrollStart: 100,
      }
    }

    let totalProfit = 0
    let totalStaked = 0
    let totalClv = 0
    let picksWon = 0
    let picksTotal = 0
    let combosWon = 0
    let combosTotal = 0

    for (const summary of summaries) {
      totalProfit += summary.totalProfit || 0
      totalStaked += summary.totalStaked || 0
      totalClv += (summary.avgCLV || 0) * (summary.totalPicks || 0)
      picksWon += summary.picksWon || 0
      picksTotal += summary.totalPicks || 0
      combosWon += summary.combosWon || 0
      combosTotal += summary.totalCombos || 0
    }

    return {
      profit: totalProfit,
      roi: totalStaked > 0 ? totalProfit / totalStaked : 0,
      avgClv: picksTotal > 0 ? totalClv / picksTotal : 0,
      picksWinRate: picksTotal > 0 ? picksWon / picksTotal : 0,
      combosWinRate: combosTotal > 0 ? combosWon / combosTotal : 0,
      bankrollStart: summaries[0]?.bankrollBefore || 100,
    }
  }

  /**
   * Calculate statistics by league
   */
  private calculateLeagueStats(picks: BettingPickDocument[]): {
    best: { name: string; roi: number } | null
    worst: { name: string; roi: number } | null
  } {
    const leagueMap = new Map<
      string,
      { profit: number; staked: number; name: string }
    >()

    for (const pick of picks) {
      const leagueKey = String(pick.league.id)
      const existing = leagueMap.get(leagueKey) || {
        profit: 0,
        staked: 0,
        name: pick.league.name,
      }

      existing.profit += pick.profit || 0
      existing.staked += pick.stake || 0
      leagueMap.set(leagueKey, existing)
    }

    let best: { name: string; roi: number } | null = null
    let worst: { name: string; roi: number } | null = null

    for (const [, league] of leagueMap) {
      const roi = league.staked > 0 ? league.profit / league.staked : 0

      if (!best || roi > best.roi) {
        best = { name: league.name, roi }
      }
      if (!worst || roi < worst.roi) {
        worst = { name: league.name, roi }
      }
    }

    return { best, worst }
  }

  /**
   * Calculate statistics by market type
   */
  private calculateMarketStats(picks: BettingPickDocument[]): {
    best: { name: string; roi: number } | null
    worst: { name: string; roi: number } | null
  } {
    const goalsProfit = picks
      .filter((p) => {
        const market = String(p.market).toLowerCase()
        return market.includes('goal') || market.includes('1h')
      })
      .reduce((sum, p) => sum + (p.profit || 0), 0)

    const goalsStaked = picks
      .filter((p) => {
        const market = String(p.market).toLowerCase()
        return market.includes('goal') || market.includes('1h')
      })
      .reduce((sum, p) => sum + (p.stake || 0), 0)

    const cornersProfit = picks
      .filter((p) => String(p.market).toLowerCase().includes('corner'))
      .reduce((sum, p) => sum + (p.profit || 0), 0)

    const cornersStaked = picks
      .filter((p) => String(p.market).toLowerCase().includes('corner'))
      .reduce((sum, p) => sum + (p.stake || 0), 0)

    const goalsRoi = goalsStaked > 0 ? goalsProfit / goalsStaked : 0
    const cornersRoi = cornersStaked > 0 ? cornersProfit / cornersStaked : 0

    const markets = [
      { name: 'Goals 1H', roi: goalsRoi },
      { name: 'Corners', roi: cornersRoi },
    ].filter((m) => !isNaN(m.roi))

    if (markets.length === 0) {
      return { best: null, worst: null }
    }

    const sorted = markets.sort((a, b) => b.roi - a.roi)
    return {
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    }
  }

  /**
   * Calculate statistics by combo type
   */
  private calculateComboTypeStats(combos: BettingComboDocument[]): {
    best: { type: string; winRate: number } | null
  } {
    const typeMap = new Map<string, { won: number; total: number }>()

    for (const combo of combos) {
      const typeKey = String(combo.type)
      const existing = typeMap.get(typeKey) || { won: 0, total: 0 }

      existing.total++
      if (combo.status === ComboStatus.WON) {
        existing.won++
      }
      typeMap.set(typeKey, existing)
    }

    let best: { type: string; winRate: number } | null = null

    for (const [type, stats] of typeMap) {
      const winRate = stats.total > 0 ? stats.won / stats.total : 0

      if (!best || winRate > best.winRate) {
        best = { type, winRate }
      }
    }

    return { best }
  }

  /**
   * Generate suggestions based on performance
   */
  private generateSuggestions(
    weeklyStats: { avgClv: number; roi: number },
    leagueStats: { worst: { name: string; roi: number } | null },
    marketStats: { worst: { name: string; roi: number } | null }
  ): string[] {
    const suggestions: string[] = []

    // Check CLV
    if (weeklyStats.avgClv < 0) {
      suggestions.push('CLV is negative - review odds timing and bookmaker selection')
    }

    // Check ROI
    if (weeklyStats.roi < -0.1) {
      suggestions.push('ROI below -10% - consider reducing stake sizes')
    }

    // Check worst league
    if (leagueStats.worst && leagueStats.worst.roi < -0.15) {
      suggestions.push(
        `Consider removing ${leagueStats.worst.name} - ROI: ${(leagueStats.worst.roi * 100).toFixed(1)}%`
      )
    }

    // Check worst market
    if (marketStats.worst && marketStats.worst.roi < -0.15) {
      suggestions.push(
        `Review ${marketStats.worst.name} model - ROI: ${(marketStats.worst.roi * 100).toFixed(1)}%`
      )
    }

    return suggestions
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    })
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualReport(): Promise<{
    totalPicks: number
    totalCombos: number
    profit: number
    roi: number
    suggestions: string[]
  }> {
    this.logger.log('Manual weekly report triggered')

    const endDate = new Date()
    endDate.setHours(0, 0, 0, 0)
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - 7)

    const picks = await this.bettingPickModel.countDocuments({
      date: { $gte: startDate, $lt: endDate },
      status: { $in: [PickStatus.WON, PickStatus.LOST, PickStatus.VOID] },
    })

    const combos = await this.bettingComboModel.countDocuments({
      createdAt: { $gte: startDate, $lt: endDate },
      status: {
        $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL],
      },
    })

    const dailySummaries = await this.dailySummaryModel
      .find({ date: { $gte: startDate, $lt: endDate } })
      .exec()

    const stats = this.calculateWeeklyStats(dailySummaries)

    return {
      totalPicks: picks,
      totalCombos: combos,
      profit: stats.profit,
      roi: stats.roi,
      suggestions: this.generateSuggestions(
        stats,
        { worst: null },
        { worst: null }
      ),
    }
  }
}
