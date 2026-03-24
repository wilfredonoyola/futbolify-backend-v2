import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { Roles } from '../../auth/roles.decorator'
import { UserRole } from '../../users/schemas/user.schema'
import { BettingCombo, BettingComboDocument } from '../schemas/betting-combo.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import {
  BettingComboOutput,
  ComboFiltersInput,
  ComboResult,
  ComboLegOutput,
  CorrelationInfo,
  ScoreBreakdown,
} from '../dto/betting.dto'
import { ComboStatus, ComboScoreLevel } from '../enums/betting.enums'

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BettingCombosResolver {
  constructor(
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>
  ) {}

  @Query(() => [BettingComboOutput], { name: 'bettingCombos' })
  async getBettingCombos(
    @Args('filters', { nullable: true }) filters?: ComboFiltersInput
  ): Promise<BettingComboOutput[]> {
    const query: Record<string, unknown> = {}

    if (filters?.dateFrom || filters?.dateTo) {
      query.createdAt = {}
      if (filters.dateFrom) {
        (query.createdAt as Record<string, Date>).$gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        (query.createdAt as Record<string, Date>).$lte = new Date(filters.dateTo)
      }
    }

    if (filters?.type) {
      query.type = filters.type
    }

    if (filters?.status) {
      query.status = filters.status
    }

    const limit = filters?.limit || 50
    const offset = filters?.offset || 0

    const combos = await this.bettingComboModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec()

    return combos.map((combo) => this.mapComboToOutput(combo))
  }

  @Query(() => BettingComboOutput, { name: 'bettingComboDetail', nullable: true })
  async getBettingComboDetail(
    @Args('id', { type: () => ID }) id: string
  ): Promise<BettingComboOutput | null> {
    const combo = await this.bettingComboModel.findById(id).exec()
    if (!combo) return null
    return this.mapComboToOutput(combo)
  }

  @Query(() => [BettingComboOutput], { name: 'bettingTodayCombos' })
  async getTodayCombos(): Promise<BettingComboOutput[]> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const combos = await this.bettingComboModel
      .find({
        createdAt: { $gte: today, $lt: tomorrow },
      })
      .sort({ score: -1 })
      .exec()

    return combos.map((combo) => this.mapComboToOutput(combo))
  }

  @Mutation(() => BettingComboOutput, { name: 'updateComboResult' })
  async updateComboResult(
    @Args('id', { type: () => ID }) id: string,
    @Args('result', { type: () => ComboResult }) result: ComboResult
  ): Promise<BettingComboOutput> {
    const combo = await this.bettingComboModel.findById(id).exec()
    if (!combo) {
      throw new Error('Combo not found')
    }

    // Map result to status
    const statusMap: Record<ComboResult, ComboStatus> = {
      [ComboResult.WON]: ComboStatus.WON,
      [ComboResult.LOST]: ComboStatus.LOST,
      [ComboResult.PARTIAL]: ComboStatus.PARTIAL,
      [ComboResult.CANCELLED]: ComboStatus.CANCELLED,
    }

    const newStatus = statusMap[result]

    // Calculate profit
    const stake = combo.stake || 0
    const odds = combo.combinedOdds || 0
    let profit = 0

    if (newStatus === ComboStatus.WON) {
      profit = stake * (odds - 1)
    } else if (newStatus === ComboStatus.LOST) {
      profit = -stake
    } else if (newStatus === ComboStatus.PARTIAL) {
      // Partial: assume 50% stake returned
      profit = -stake * 0.5
    }

    // Update combo
    const updatedCombo = await this.bettingComboModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: newStatus,
            profit,
            updatedAt: new Date(),
          },
        },
        { new: true }
      )
      .exec()

    // Update bankroll
    if (profit !== 0) {
      await this.bettingSettingsModel.updateOne({}, { $inc: { bankroll: profit } })
    }

    return this.mapComboToOutput(updatedCombo!)
  }

  private getScoreLevel(score: number): ComboScoreLevel {
    if (score >= 80) return ComboScoreLevel.ELITE
    if (score >= 65) return ComboScoreLevel.FUERTE
    if (score >= 50) return ComboScoreLevel.SOLIDA
    if (score >= 35) return ComboScoreLevel.MARGINAL
    return ComboScoreLevel.DESCARTAR
  }

  private mapComboToOutput(combo: BettingComboDocument): BettingComboOutput {
    return {
      id: combo._id.toString(),
      date: combo.createdAt,
      type: combo.type,
      sharpConfirmed: combo.sharpConfirmed || false,
      legs: (combo.legs || []).map(
        (leg): ComboLegOutput => ({
          pickId: leg.pickId?.toString(),
          fixtureId: leg.fixtureId,
          market: leg.market,
          direction: leg.direction,
          odds: leg.odds,
          probOwn: leg.probOwn,
          result: leg.result,
        })
      ),
      correlation: combo.correlation
        ? ({
            base: combo.correlation.base || 0,
            dynamic: combo.correlation.dynamic || combo.correlation,
            adjustments: combo.correlation.adjustments,
          } as CorrelationInfo)
        : undefined,
      pCasa: combo.pCasa || 0,
      pReal: combo.pReal || 0,
      hiddenEdge: combo.hiddenEdge || 0,
      combinedOdds: combo.combinedOdds,
      evReal: combo.evReal || 0,
      score: combo.score,
      scoreLevel: this.getScoreLevel(combo.score),
      scoreBreakdown: combo.scoreBreakdown as ScoreBreakdown,
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
