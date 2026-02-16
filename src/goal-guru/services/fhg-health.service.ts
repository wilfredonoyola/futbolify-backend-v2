import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  FhgHealth,
  FhgHealthDocument,
  FhgLeagueHealthMetrics,
  FhgSignalHealthMetrics,
  FhgHealthAlert,
} from '../schemas/fhg-health.schema'
import { FhgSelection, FhgSelectionDocument } from '../schemas/fhg-selection.schema'
import { FhgLogService } from './fhg-log.service'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'
import { FhgStatus } from '../enums/fhg-status.enum'
import { FhgOutcome } from '../enums/fhg-outcome.enum'
import { FhgSignal } from '../enums/fhg-signal.enum'
import {
  CLV_GREEN_THRESHOLD,
  CLV_YELLOW_THRESHOLD,
  getFhgLeagueByCode,
} from '../constants/fhg-config'
import { FhgHealthDto } from '../dto/fhg-health.dto'

/**
 * FHG Health Service
 * Monitors system health with CLV as the supreme metric
 *
 * Status determination:
 * - GREEN: CLV >= 2% - Edge is working
 * - YELLOW: CLV >= 0% and < 2% - Edge is marginal
 * - RED: CLV < 0% - No edge, should pause
 */
@Injectable()
export class FhgHealthService {
  private readonly logger = new Logger(FhgHealthService.name)

  constructor(
    @InjectModel(FhgHealth.name)
    private healthModel: Model<FhgHealthDocument>,
    @InjectModel(FhgSelection.name)
    private selectionModel: Model<FhgSelectionDocument>,
    private logService: FhgLogService
  ) {}

  /**
   * Generate a health report
   */
  async generateHealthReport(
    periodDays = 30
  ): Promise<FhgHealthDto> {
    const now = new Date()
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - periodDays)

    await this.logService.info(
      FhgLogCategory.HEALTH,
      `Generating health report for last ${periodDays} days`
    )

    // Get all selections in period
    const selections = await this.selectionModel
      .find({
        createdAt: { $gte: periodStart, $lte: now },
      })
      .exec()

    // Calculate overall metrics
    const totalSelections = selections.length
    const settledSelections = selections.filter(
      (s) => s.outcome !== FhgOutcome.PENDING
    )
    const pendingSelections = selections.filter(
      (s) => s.outcome === FhgOutcome.PENDING
    )
    const wonSelections = settledSelections.filter(
      (s) => s.outcome === FhgOutcome.WON
    )
    const lostSelections = settledSelections.filter(
      (s) => s.outcome === FhgOutcome.LOST
    )
    const voidedSelections = settledSelections.filter(
      (s) => s.outcome === FhgOutcome.VOID
    )

    const won = wonSelections.length
    const lost = lostSelections.length
    const voided = voidedSelections.length

    // Calculate hit rate (excluding voided)
    const hitRate =
      won + lost > 0 ? won / (won + lost) : 0

    // Calculate average CLV
    const selectionsWithClv = settledSelections.filter(
      (s) => s.clv !== null && s.clv !== undefined
    )
    const avgClv =
      selectionsWithClv.length > 0
        ? selectionsWithClv.reduce((sum, s) => sum + (s.clv || 0), 0) /
          selectionsWithClv.length
        : 0

    // Calculate ROI
    const totalStaked = settledSelections.reduce(
      (sum, s) => sum + s.stakePercentage,
      0
    )
    const totalProfitLoss = settledSelections.reduce(
      (sum, s) => sum + (s.profitLoss || 0),
      0
    )
    const roi = totalStaked > 0 ? totalProfitLoss / totalStaked : 0

    // Calculate CLV by period
    const clv7d = await this.calculateClvForPeriod(7)
    const clv30d = await this.calculateClvForPeriod(30)
    const clvAllTime = await this.calculateClvForPeriod(0) // 0 = all time

    // Determine status based on CLV
    let status: FhgStatus
    if (avgClv >= CLV_GREEN_THRESHOLD) {
      status = FhgStatus.GREEN
    } else if (avgClv >= CLV_YELLOW_THRESHOLD) {
      status = FhgStatus.YELLOW
    } else {
      status = FhgStatus.RED
    }

    // Calculate breakdowns
    const byLeague = await this.calculateLeagueBreakdown(settledSelections)
    const bySignal = this.calculateSignalBreakdown(settledSelections)

    // Generate alerts
    const alerts = this.generateAlerts(
      avgClv,
      clv7d,
      clv30d,
      hitRate,
      roi,
      totalSelections
    )

    // Log health status
    await this.logService.info(
      FhgLogCategory.HEALTH,
      `Health Report: ${status} | CLV ${(avgClv * 100).toFixed(2)}% | Hit Rate ${(hitRate * 100).toFixed(1)}% | ROI ${(roi * 100).toFixed(2)}%`,
      { status, avgClv, hitRate, roi, totalSelections }
    )

    for (const alert of alerts) {
      await this.logService.warn(FhgLogCategory.HEALTH, `Alert: ${alert.message}`)
    }

    // Save health snapshot
    const health = await this.healthModel.create({
      status,
      reportDate: now,
      periodStart,
      periodEnd: now,
      totalSelections,
      settledSelections: settledSelections.length,
      pendingSelections: pendingSelections.length,
      won,
      lost,
      voided,
      hitRate,
      avgClv,
      roi,
      totalProfitLoss,
      totalStaked,
      clv7d,
      clv30d,
      clvAllTime,
      byLeague,
      bySignal,
      alerts,
    })

    return this.toDto(health)
  }

  /**
   * Get the latest health report
   */
  async getLatestHealthReport(): Promise<FhgHealthDto | null> {
    const health = await this.healthModel
      .findOne()
      .sort({ reportDate: -1 })
      .exec()

    if (!health) {
      // Generate a fresh report if none exists
      return this.generateHealthReport()
    }

    // If report is older than 1 hour, generate a new one
    const oneHourAgo = new Date()
    oneHourAgo.setHours(oneHourAgo.getHours() - 1)

    if (health.reportDate < oneHourAgo) {
      return this.generateHealthReport()
    }

    return this.toDto(health)
  }

  /**
   * Calculate CLV for a specific period
   */
  private async calculateClvForPeriod(days: number): Promise<number | null> {
    let query = {}

    if (days > 0) {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      query = { createdAt: { $gte: startDate } }
    }

    const selections = await this.selectionModel
      .find({
        ...query,
        outcome: { $ne: FhgOutcome.PENDING },
        clv: { $ne: null },
      })
      .exec()

    if (selections.length === 0) return null

    const totalClv = selections.reduce((sum, s) => sum + (s.clv || 0), 0)
    return totalClv / selections.length
  }

  /**
   * Calculate breakdown by league
   */
  private async calculateLeagueBreakdown(
    selections: FhgSelection[]
  ): Promise<FhgLeagueHealthMetrics[]> {
    const leagueMap = new Map<string, FhgSelection[]>()

    for (const selection of selections) {
      const existing = leagueMap.get(selection.leagueCode) || []
      existing.push(selection)
      leagueMap.set(selection.leagueCode, existing)
    }

    const breakdown: FhgLeagueHealthMetrics[] = []

    for (const [leagueCode, leagueSelections] of leagueMap) {
      const config = getFhgLeagueByCode(leagueCode)
      const leagueName = config?.name || leagueCode

      const won = leagueSelections.filter(
        (s) => s.outcome === FhgOutcome.WON
      ).length
      const lost = leagueSelections.filter(
        (s) => s.outcome === FhgOutcome.LOST
      ).length
      const hitRate = won + lost > 0 ? won / (won + lost) : 0

      const withClv = leagueSelections.filter(
        (s) => s.clv !== null && s.clv !== undefined
      )
      const avgClv =
        withClv.length > 0
          ? withClv.reduce((sum, s) => sum + (s.clv || 0), 0) / withClv.length
          : 0

      const totalStaked = leagueSelections.reduce(
        (sum, s) => sum + s.stakePercentage,
        0
      )
      const totalProfitLoss = leagueSelections.reduce(
        (sum, s) => sum + (s.profitLoss || 0),
        0
      )
      const roi = totalStaked > 0 ? totalProfitLoss / totalStaked : 0

      breakdown.push({
        leagueCode,
        leagueName,
        totalSelections: leagueSelections.length,
        won,
        lost,
        hitRate,
        avgClv,
        roi,
      })
    }

    return breakdown.sort((a, b) => b.avgClv - a.avgClv)
  }

  /**
   * Calculate breakdown by signal
   */
  private calculateSignalBreakdown(
    selections: FhgSelection[]
  ): FhgSignalHealthMetrics[] {
    const signals = [FhgSignal.A, FhgSignal.B, FhgSignal.C]
    const breakdown: FhgSignalHealthMetrics[] = []

    for (const signal of signals) {
      const signalSelections = selections.filter((s) => s.signal === signal)
      if (signalSelections.length === 0) continue

      const won = signalSelections.filter(
        (s) => s.outcome === FhgOutcome.WON
      ).length
      const lost = signalSelections.filter(
        (s) => s.outcome === FhgOutcome.LOST
      ).length
      const hitRate = won + lost > 0 ? won / (won + lost) : 0

      const withClv = signalSelections.filter(
        (s) => s.clv !== null && s.clv !== undefined
      )
      const avgClv =
        withClv.length > 0
          ? withClv.reduce((sum, s) => sum + (s.clv || 0), 0) / withClv.length
          : 0

      const totalStaked = signalSelections.reduce(
        (sum, s) => sum + s.stakePercentage,
        0
      )
      const totalProfitLoss = signalSelections.reduce(
        (sum, s) => sum + (s.profitLoss || 0),
        0
      )
      const roi = totalStaked > 0 ? totalProfitLoss / totalStaked : 0

      breakdown.push({
        signal,
        totalSelections: signalSelections.length,
        won,
        lost,
        hitRate,
        avgClv,
        roi,
      })
    }

    return breakdown
  }

  /**
   * Generate alerts based on metrics
   */
  private generateAlerts(
    avgClv: number,
    clv7d: number | null,
    clv30d: number | null,
    hitRate: number,
    roi: number,
    totalSelections: number
  ): FhgHealthAlert[] {
    const alerts: FhgHealthAlert[] = []

    // CLV alerts
    if (clv30d !== null && clv30d < 0) {
      alerts.push({
        severity: 'CRITICAL',
        message: `Negative CLV over 30 days: ${(clv30d * 100).toFixed(2)}%`,
        recommendation: 'Consider PAUSING the system to review the model',
      })
    } else if (clv7d !== null && clv7d < 0) {
      alerts.push({
        severity: 'WARNING',
        message: `Negative CLV over 7 days: ${(clv7d * 100).toFixed(2)}%`,
        recommendation: 'Monitor closely, may need adjustments',
      })
    }

    // Hit rate alert
    if (totalSelections >= 20 && hitRate < 0.5) {
      alerts.push({
        severity: 'WARNING',
        message: `Hit rate below 50%: ${(hitRate * 100).toFixed(1)}%`,
        recommendation: 'Review prediction model factors',
      })
    }

    // ROI alert (3 month check would need longer data)
    if (totalSelections >= 50 && roi < -0.1) {
      alerts.push({
        severity: 'CRITICAL',
        message: `Significant negative ROI: ${(roi * 100).toFixed(2)}%`,
        recommendation: 'Edge may have closed. Consider major review or pause',
      })
    }

    // Low sample size warning
    if (totalSelections < 20) {
      alerts.push({
        severity: 'WARNING',
        message: `Small sample size: ${totalSelections} selections`,
        recommendation:
          'Wait for more data before making significant changes',
      })
    }

    return alerts
  }

  /**
   * Convert health document to DTO
   */
  private toDto(health: FhgHealth): FhgHealthDto {
    return {
      id: health._id.toString(),
      status: health.status,
      reportDate: health.reportDate,
      periodStart: health.periodStart,
      periodEnd: health.periodEnd,
      totalSelections: health.totalSelections,
      settledSelections: health.settledSelections,
      pendingSelections: health.pendingSelections,
      won: health.won,
      lost: health.lost,
      voided: health.voided,
      hitRate: health.hitRate,
      avgClv: health.avgClv,
      roi: health.roi,
      totalProfitLoss: health.totalProfitLoss,
      totalStaked: health.totalStaked,
      clv7d: health.clv7d,
      clv30d: health.clv30d,
      clvAllTime: health.clvAllTime,
      byLeague: health.byLeague.map((l) => ({
        leagueCode: l.leagueCode,
        leagueName: l.leagueName,
        totalSelections: l.totalSelections,
        won: l.won,
        lost: l.lost,
        hitRate: l.hitRate,
        avgClv: l.avgClv,
        roi: l.roi,
      })),
      bySignal: health.bySignal.map((s) => ({
        signal: s.signal,
        totalSelections: s.totalSelections,
        won: s.won,
        lost: s.lost,
        hitRate: s.hitRate,
        avgClv: s.avgClv,
        roi: s.roi,
      })),
      alerts: health.alerts.map((a) => ({
        severity: a.severity,
        message: a.message,
        recommendation: a.recommendation,
      })),
    }
  }
}
