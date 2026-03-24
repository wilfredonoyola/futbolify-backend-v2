import { Resolver, Query, Args, Int } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { Roles } from '../../auth/roles.decorator'
import { UserRole } from '../../users/schemas/user.schema'
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
import {
  BettingAnalytics,
  BettingDashboard,
  LeaguePerformance,
  MarketPerformance,
  ComboTypePerformance,
  BankrollDataPoint,
  CLVDataPoint,
  BettingPickOutput,
  BettingComboOutput,
  CredibilityDashboard,
  CredibilityStats,
} from '../dto/betting.dto'
import { PickStatus, ComboStatus, ComboType, MarketType, ComboScoreLevel } from '../enums/betting.enums'

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BettingAnalyticsResolver {
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

  @Query(() => BettingDashboard, { name: 'bettingDashboard' })
  async getBettingDashboard(
    @Args('date', { nullable: true }) dateStr?: string
  ): Promise<BettingDashboard> {
    const date = dateStr ? new Date(dateStr) : new Date()
    date.setHours(0, 0, 0, 0)
    const tomorrow = new Date(date)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Get settings
    const settings = await this.bettingSettingsModel.findOne().exec()
    const bankroll = settings?.bankroll || 100

    // Get today's picks
    const todayPicks = await this.bettingPickModel
      .find({ kickoff: { $gte: date, $lt: tomorrow } })
      .sort({ kickoff: 1 })
      .exec()

    // Get today's combos
    const todayCombos = await this.bettingComboModel
      .find({ createdAt: { $gte: date, $lt: tomorrow } })
      .sort({ score: -1 })
      .exec()

    // Get recent results (last 7 days)
    const weekAgo = new Date(date)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const recentResults = await this.bettingPickModel
      .find({
        date: { $gte: weekAgo, $lt: date },
        status: { $in: [PickStatus.WON, PickStatus.LOST, PickStatus.VOID] },
      })
      .sort({ kickoff: -1 })
      .limit(20)
      .exec()

    // Calculate overall stats
    const allPicks = await this.bettingPickModel
      .find({ status: { $in: [PickStatus.WON, PickStatus.LOST] } })
      .exec()

    const allCombos = await this.bettingComboModel
      .find({ status: { $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL] } })
      .exec()

    const totalBets = allPicks.length + allCombos.length
    const totalStaked =
      allPicks.reduce((sum, p) => sum + (p.stake || 0), 0) +
      allCombos.reduce((sum, c) => sum + (c.stake || 0), 0)
    const totalProfit =
      allPicks.reduce((sum, p) => sum + (p.profit || 0), 0) +
      allCombos.reduce((sum, c) => sum + (c.profit || 0), 0)

    const roi = totalStaked > 0 ? totalProfit / totalStaked : 0
    const avgCLV =
      allPicks.length > 0
        ? allPicks.reduce((sum, p) => sum + (p.clv || 0), 0) / allPicks.length
        : 0

    // Calculate streak
    const summaries = await this.dailySummaryModel
      .find()
      .sort({ date: -1 })
      .limit(30)
      .exec()

    let currentStreak = 0
    let maxStreak = 0
    let tempStreak = 0

    for (const summary of summaries) {
      if ((summary.totalProfit || 0) > 0) {
        tempStreak++
        if (tempStreak > maxStreak) maxStreak = tempStreak
        if (currentStreak === 0 || currentStreak === tempStreak - 1) {
          currentStreak = tempStreak
        }
      } else {
        if (currentStreak === tempStreak) {
          // First loss after current streak
        }
        tempStreak = 0
      }
    }

    // Today's exposure
    const todayExposure =
      todayPicks
        .filter((p) => p.status === PickStatus.PENDING || p.status === PickStatus.ACTIVE)
        .reduce((sum, p) => sum + (p.stake || 0), 0) +
      todayCombos
        .filter((c) => c.status === ComboStatus.PENDING)
        .reduce((sum, c) => sum + (c.stake || 0), 0)

    return {
      bankroll,
      roi,
      avgCLV,
      currentStreak,
      maxStreak,
      totalBets,
      todayPicks: todayPicks.map((p) => this.mapPickToOutput(p)),
      todayCombos: todayCombos.map((c) => this.mapComboToOutput(c)),
      recentResults: recentResults.map((p) => this.mapPickToOutput(p)),
      todayExposure,
    }
  }

  @Query(() => BettingAnalytics, { name: 'bettingAnalytics' })
  async getBettingAnalytics(
    @Args('dateFrom', { nullable: true }) dateFrom?: string,
    @Args('dateTo', { nullable: true }) dateTo?: string
  ): Promise<BettingAnalytics> {
    const query: Record<string, unknown> = {
      status: { $in: [PickStatus.WON, PickStatus.LOST] },
    }

    if (dateFrom || dateTo) {
      query.date = {}
      if (dateFrom) {
        (query.date as Record<string, Date>).$gte = new Date(dateFrom)
      }
      if (dateTo) {
        (query.date as Record<string, Date>).$lte = new Date(dateTo)
      }
    }

    const picks = await this.bettingPickModel.find(query).exec()

    const comboQuery: Record<string, unknown> = {
      status: { $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL] },
    }
    if (dateFrom || dateTo) {
      comboQuery.createdAt = query.date
    }

    const combos = await this.bettingComboModel.find(comboQuery).exec()

    const totalBets = picks.length + combos.length
    const wins = picks.filter((p) => p.status === PickStatus.WON).length
    const comboWins = combos.filter((c) => c.status === ComboStatus.WON).length
    const winRate = totalBets > 0 ? (wins + comboWins) / totalBets : 0

    const totalStaked =
      picks.reduce((sum, p) => sum + (p.stake || 0), 0) +
      combos.reduce((sum, c) => sum + (c.stake || 0), 0)
    const totalProfit =
      picks.reduce((sum, p) => sum + (p.profit || 0), 0) +
      combos.reduce((sum, c) => sum + (c.profit || 0), 0)

    const roi = totalStaked > 0 ? totalProfit / totalStaked : 0
    const avgCLV =
      picks.length > 0
        ? picks.reduce((sum, p) => sum + (p.clv || 0), 0) / picks.length
        : 0

    // Calculate Sharpe ratio (simplified)
    const dailyReturns: number[] = []
    const summaries = await this.dailySummaryModel.find(query.date ? { date: query.date } : {}).exec()
    for (const summary of summaries) {
      if (summary.bankrollBefore && summary.bankrollBefore > 0) {
        dailyReturns.push((summary.totalProfit || 0) / summary.bankrollBefore)
      }
    }

    const avgReturn = dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0
    const stdDev = dailyReturns.length > 1
      ? Math.sqrt(
          dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
            (dailyReturns.length - 1)
        )
      : 1
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0

    // Max drawdown
    let maxDrawdown = 0
    let peak = 0
    for (const summary of summaries.sort((a, b) => a.date.getTime() - b.date.getTime())) {
      const bankroll = summary.bankrollAfter || 0
      if (bankroll > peak) peak = bankroll
      const drawdown = peak > 0 ? (peak - bankroll) / peak : 0
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }

    // Best and worst day
    const dailyProfits = summaries.map((s) => s.totalProfit || 0)
    const bestDay = dailyProfits.length > 0 ? Math.max(...dailyProfits) : 0
    const worstDay = dailyProfits.length > 0 ? Math.min(...dailyProfits) : 0

    return {
      totalBets,
      winRate,
      roi,
      avgCLV,
      sharpeRatio,
      maxDrawdown,
      totalProfit,
      bestDay,
      worstDay,
    }
  }

  @Query(() => [LeaguePerformance], { name: 'bettingPerformanceByLeague' })
  async getPerformanceByLeague(): Promise<LeaguePerformance[]> {
    const picks = await this.bettingPickModel
      .find({ status: { $in: [PickStatus.WON, PickStatus.LOST] } })
      .exec()

    const byLeague = new Map<number, {
      name: string
      bets: number
      wins: number
      staked: number
      profit: number
      clvSum: number
    }>()

    for (const pick of picks) {
      const leagueId = pick.league.id
      const existing = byLeague.get(leagueId) || {
        name: pick.league.name,
        bets: 0,
        wins: 0,
        staked: 0,
        profit: 0,
        clvSum: 0,
      }

      existing.bets++
      if (pick.status === PickStatus.WON) existing.wins++
      existing.staked += pick.stake || 0
      existing.profit += pick.profit || 0
      existing.clvSum += pick.clv || 0

      byLeague.set(leagueId, existing)
    }

    return Array.from(byLeague.entries())
      .map(([leagueId, data]) => ({
        leagueId,
        leagueName: data.name,
        bets: data.bets,
        winRate: data.bets > 0 ? data.wins / data.bets : 0,
        roi: data.staked > 0 ? data.profit / data.staked : 0,
        avgCLV: data.bets > 0 ? data.clvSum / data.bets : 0,
        profit: data.profit,
      }))
      .sort((a, b) => b.profit - a.profit)
  }

  @Query(() => [MarketPerformance], { name: 'bettingPerformanceByMarket' })
  async getPerformanceByMarket(): Promise<MarketPerformance[]> {
    const picks = await this.bettingPickModel
      .find({ status: { $in: [PickStatus.WON, PickStatus.LOST] } })
      .exec()

    const byMarket = new Map<MarketType, {
      bets: number
      wins: number
      staked: number
      profit: number
      clvSum: number
    }>()

    for (const pick of picks) {
      const market = pick.market
      const existing = byMarket.get(market) || {
        bets: 0,
        wins: 0,
        staked: 0,
        profit: 0,
        clvSum: 0,
      }

      existing.bets++
      if (pick.status === PickStatus.WON) existing.wins++
      existing.staked += pick.stake || 0
      existing.profit += pick.profit || 0
      existing.clvSum += pick.clv || 0

      byMarket.set(market, existing)
    }

    return Array.from(byMarket.entries())
      .map(([market, data]) => ({
        market,
        bets: data.bets,
        winRate: data.bets > 0 ? data.wins / data.bets : 0,
        roi: data.staked > 0 ? data.profit / data.staked : 0,
        avgCLV: data.bets > 0 ? data.clvSum / data.bets : 0,
        profit: data.profit,
      }))
      .sort((a, b) => b.profit - a.profit)
  }

  @Query(() => [ComboTypePerformance], { name: 'bettingPerformanceByComboType' })
  async getPerformanceByComboType(): Promise<ComboTypePerformance[]> {
    const combos = await this.bettingComboModel
      .find({ status: { $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL] } })
      .exec()

    const byType = new Map<ComboType, {
      count: number
      wins: number
      staked: number
      profit: number
      evSum: number
      hiddenEdgeSum: number
    }>()

    for (const combo of combos) {
      const type = combo.type
      const existing = byType.get(type) || {
        count: 0,
        wins: 0,
        staked: 0,
        profit: 0,
        evSum: 0,
        hiddenEdgeSum: 0,
      }

      existing.count++
      if (combo.status === ComboStatus.WON) existing.wins++
      existing.staked += combo.stake || 0
      existing.profit += combo.profit || 0
      existing.evSum += combo.evReal || 0
      existing.hiddenEdgeSum += combo.hiddenEdge || 0

      byType.set(type, existing)
    }

    return Array.from(byType.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        winRate: data.count > 0 ? data.wins / data.count : 0,
        roi: data.staked > 0 ? data.profit / data.staked : 0,
        avgEV: data.count > 0 ? data.evSum / data.count : 0,
        avgHiddenEdge: data.count > 0 ? data.hiddenEdgeSum / data.count : 0,
        profit: data.profit,
      }))
      .sort((a, b) => b.profit - a.profit)
  }

  @Query(() => [BankrollDataPoint], { name: 'bettingBankrollHistory' })
  async getBankrollHistory(
    @Args('days', { type: () => Int, nullable: true, defaultValue: 30 }) days: number
  ): Promise<BankrollDataPoint[]> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    const summaries = await this.dailySummaryModel
      .find({ date: { $gte: startDate } })
      .sort({ date: 1 })
      .exec()

    return summaries.map((s) => ({
      date: s.date,
      value: s.bankrollAfter || 0,
      dailyProfit: s.totalProfit || 0,
    }))
  }

  @Query(() => [CLVDataPoint], { name: 'bettingCLVHistory' })
  async getCLVHistory(): Promise<CLVDataPoint[]> {
    const picks = await this.bettingPickModel
      .find({
        status: { $in: [PickStatus.WON, PickStatus.LOST] },
        clv: { $exists: true },
      })
      .sort({ kickoff: 1 })
      .limit(100)
      .exec()

    return picks.map((p) => ({
      date: p.kickoff,
      clv: p.clv || 0,
      result: p.status,
    }))
  }

  @Query(() => CredibilityDashboard, {
    name: 'bettingCredibilityDashboard',
    description: 'Compare system picks performance vs personally placed bets',
  })
  async getCredibilityDashboard(): Promise<CredibilityDashboard> {
    // Get settings for bankroll
    const settings = await this.bettingSettingsModel.findOne().exec()
    const personalBankroll = settings?.bankroll || 100

    // Get all settled picks
    const allPicks = await this.bettingPickModel
      .find({ status: { $in: [PickStatus.WON, PickStatus.LOST] } })
      .exec()

    // Calculate system stats (ALL picks)
    const systemStats = this.calculateStats(allPicks)

    // Calculate personal stats (only betPlaced=true)
    const personalPicks = allPicks.filter((p) => p.betPlaced === true)
    const personalStats = this.calculateStats(personalPicks)

    // Calculate today's personal profit
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayPicks = await this.bettingPickModel
      .find({
        kickoff: { $gte: today, $lt: tomorrow },
        status: { $in: [PickStatus.WON, PickStatus.LOST] },
        betPlaced: true,
      })
      .exec()

    const todayProfit = todayPicks.reduce((sum, p) => sum + (p.profit || 0), 0)

    // Calculate personal streak (consecutive wins on betPlaced picks)
    const recentPersonalPicks = await this.bettingPickModel
      .find({
        status: { $in: [PickStatus.WON, PickStatus.LOST] },
        betPlaced: true,
      })
      .sort({ kickoff: -1 })
      .limit(20)
      .exec()

    let personalStreak = 0
    for (const pick of recentPersonalPicks) {
      if (pick.status === PickStatus.WON) {
        personalStreak++
      } else {
        break
      }
    }

    return {
      systemStats,
      personalStats,
      personalBankroll,
      todayProfit,
      personalStreak,
    }
  }

  /**
   * Calculate stats for a set of picks
   */
  private calculateStats(picks: BettingPickDocument[]): CredibilityStats {
    const totalPicks = picks.length
    const wins = picks.filter((p) => p.status === PickStatus.WON).length
    const losses = picks.filter((p) => p.status === PickStatus.LOST).length
    const totalStaked = picks.reduce((sum, p) => sum + (p.stake || 0), 0)
    const totalProfit = picks.reduce((sum, p) => sum + (p.profit || 0), 0)
    const winRate = totalPicks > 0 ? wins / totalPicks : 0
    const roi = totalStaked > 0 ? totalProfit / totalStaked : 0

    return {
      winRate,
      roi,
      totalProfit,
      totalPicks,
      wins,
      losses,
      totalStaked,
    }
  }

  private getScoreLevel(score: number): ComboScoreLevel {
    if (score >= 80) return ComboScoreLevel.ELITE
    if (score >= 65) return ComboScoreLevel.FUERTE
    if (score >= 50) return ComboScoreLevel.SOLIDA
    if (score >= 35) return ComboScoreLevel.MARGINAL
    return ComboScoreLevel.DESCARTAR
  }

  private mapPickToOutput(pick: BettingPickDocument): BettingPickOutput {
    return {
      id: pick._id.toString(),
      fixtureId: pick.fixtureId,
      date: pick.date,
      league: pick.league as any,
      teamHome: pick.teamHome as any,
      teamAway: pick.teamAway as any,
      kickoff: pick.kickoff,
      timeWindow: pick.timeWindow,
      market: pick.market,
      direction: pick.direction,
      line: pick.line,
      probOwn: pick.probOwn,
      probImplied: pick.probImplied,
      edge: pick.edge,
      confidenceScore: pick.confidenceScore,
      modelInputs: pick.modelInputs as any,
      reasons: pick.reasons,
      stars: pick.stars,
      oddsAtDetection: pick.oddsAtDetection,
      oddsAtBet: pick.oddsAtBet,
      oddsAtClose: pick.oddsAtClose,
      bestBookmaker: pick.bestBookmaker,
      steamMove: pick.steamMove as any,
      status: pick.status,
      stake: pick.stake,
      profit: pick.profit,
      clv: pick.clv,
      matchResult: pick.matchResult as any,
      betPlaced: pick.betPlaced || false,
      betPlacedAt: pick.betPlacedAt,
      betAmount: pick.betAmount,
      createdAt: pick.createdAt,
      updatedAt: pick.updatedAt,
    }
  }

  private mapComboToOutput(combo: BettingComboDocument): BettingComboOutput {
    return {
      id: combo._id.toString(),
      date: combo.createdAt,
      type: combo.type,
      sharpConfirmed: combo.sharpConfirmed || false,
      legs: (combo.legs || []).map((leg) => ({
        pickId: leg.pickId?.toString(),
        fixtureId: leg.fixtureId,
        market: leg.market,
        direction: leg.direction,
        odds: leg.odds,
        probOwn: leg.probOwn,
        result: leg.result,
      })),
      correlation: combo.correlation as any,
      pCasa: combo.pCasa || 0,
      pReal: combo.pReal || 0,
      hiddenEdge: combo.hiddenEdge || 0,
      combinedOdds: combo.combinedOdds,
      evReal: combo.evReal || 0,
      score: combo.score,
      scoreLevel: this.getScoreLevel(combo.score),
      scoreBreakdown: combo.scoreBreakdown as any,
      status: combo.status,
      stake: combo.stake,
      profit: combo.profit,
      timeWindow: combo.timeWindow,
      warnings: combo.warnings,
      createdAt: combo.createdAt,
      updatedAt: combo.updatedAt,
    }
  }
}
