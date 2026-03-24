import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { Roles } from '../../auth/roles.decorator'
import { UserRole } from '../../users/schemas/user.schema'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import {
  BettingPickOutput,
  PickFiltersInput,
  PickResult,
  LeagueInfo,
  BettingTeamInfo,
  SteamMoveInfo,
  ModelInputs,
  MatchResult,
} from '../dto/betting.dto'
import { PickStatus } from '../enums/betting.enums'
import { getMarketLabel } from '../utils/market-labels'

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BettingPicksResolver {
  constructor(
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>
  ) {}

  @Query(() => [BettingPickOutput], { name: 'bettingPicks' })
  async getBettingPicks(
    @Args('filters', { nullable: true }) filters?: PickFiltersInput
  ): Promise<BettingPickOutput[]> {
    const query: Record<string, unknown> = {}

    if (filters?.dateFrom || filters?.dateTo) {
      query.date = {}
      if (filters.dateFrom) {
        (query.date as Record<string, Date>).$gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        (query.date as Record<string, Date>).$lte = new Date(filters.dateTo)
      }
    }

    if (filters?.leagueId) {
      query['league.id'] = filters.leagueId
    }

    if (filters?.market) {
      query.market = filters.market
    }

    if (filters?.status) {
      query.status = filters.status
    }

    if (filters?.minConfidence) {
      query.confidenceScore = { $gte: filters.minConfidence }
    }

    if (filters?.betPlaced !== undefined) {
      query.betPlaced = filters.betPlaced
    }

    const limit = filters?.limit || 50
    const offset = filters?.offset || 0

    const picks = await this.bettingPickModel
      .find(query)
      .sort({ kickoff: -1 })
      .skip(offset)
      .limit(limit)
      .exec()

    return picks.map((pick) => this.mapPickToOutput(pick))
  }

  @Query(() => BettingPickOutput, { name: 'bettingPickDetail', nullable: true })
  async getBettingPickDetail(
    @Args('id', { type: () => ID }) id: string
  ): Promise<BettingPickOutput | null> {
    const pick = await this.bettingPickModel.findById(id).exec()
    if (!pick) return null
    return this.mapPickToOutput(pick)
  }

  @Query(() => [BettingPickOutput], { name: 'bettingTodayPicks' })
  async getTodayPicks(): Promise<BettingPickOutput[]> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const picks = await this.bettingPickModel
      .find({
        kickoff: { $gte: today, $lt: tomorrow },
      })
      .sort({ kickoff: 1 })
      .exec()

    return picks.map((pick) => this.mapPickToOutput(pick))
  }

  @Mutation(() => BettingPickOutput, { name: 'updatePickResult' })
  async updatePickResult(
    @Args('id', { type: () => ID }) id: string,
    @Args('result', { type: () => PickResult }) result: PickResult
  ): Promise<BettingPickOutput> {
    const pick = await this.bettingPickModel.findById(id).exec()
    if (!pick) {
      throw new Error('Pick not found')
    }

    // Map result to status
    const statusMap: Record<PickResult, PickStatus> = {
      [PickResult.WON]: PickStatus.WON,
      [PickResult.LOST]: PickStatus.LOST,
      [PickResult.VOID]: PickStatus.VOID,
    }

    const newStatus = statusMap[result]

    // Calculate profit
    const stake = pick.stake || 0
    const odds = pick.oddsAtBet || pick.oddsAtDetection || 0
    let profit = 0

    if (newStatus === PickStatus.WON) {
      profit = stake * (odds - 1)
    } else if (newStatus === PickStatus.LOST) {
      profit = -stake
    }
    // VOID = 0 profit

    // Update pick
    const updatedPick = await this.bettingPickModel
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

    return this.mapPickToOutput(updatedPick!)
  }

  @Mutation(() => BettingPickOutput, { name: 'cancelPick' })
  async cancelPick(
    @Args('id', { type: () => ID }) id: string,
    @Args('reason', { nullable: true }) reason?: string
  ): Promise<BettingPickOutput> {
    const updatedPick = await this.bettingPickModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: PickStatus.CANCELLED,
            updatedAt: new Date(),
          },
        },
        { new: true }
      )
      .exec()

    if (!updatedPick) {
      throw new Error('Pick not found')
    }

    return this.mapPickToOutput(updatedPick)
  }

  @Mutation(() => BettingPickOutput, {
    name: 'placeBet',
    description: 'Mark a pick as actually bet (user placed the bet)',
  })
  async placeBet(
    @Args('pickId', { type: () => ID }) pickId: string
  ): Promise<BettingPickOutput> {
    const pick = await this.bettingPickModel.findById(pickId).exec()
    if (!pick) {
      throw new Error('Pick not found')
    }

    // Get stake from settings for default bet amount
    const settings = await this.bettingSettingsModel.findOne().exec()
    const defaultBetAmount = pick.stake || 0

    const updatedPick = await this.bettingPickModel
      .findByIdAndUpdate(
        pickId,
        {
          $set: {
            betPlaced: true,
            betPlacedAt: new Date(),
            betAmount: defaultBetAmount,
            updatedAt: new Date(),
          },
        },
        { new: true }
      )
      .exec()

    return this.mapPickToOutput(updatedPick!)
  }

  @Mutation(() => BettingPickOutput, {
    name: 'unplaceBet',
    description: 'Unmark a pick as bet (toggle off)',
  })
  async unplaceBet(
    @Args('pickId', { type: () => ID }) pickId: string
  ): Promise<BettingPickOutput> {
    const pick = await this.bettingPickModel.findById(pickId).exec()
    if (!pick) {
      throw new Error('Pick not found')
    }

    const updatedPick = await this.bettingPickModel
      .findByIdAndUpdate(
        pickId,
        {
          $set: {
            betPlaced: false,
            betPlacedAt: null,
            betAmount: null,
            updatedAt: new Date(),
          },
        },
        { new: true }
      )
      .exec()

    return this.mapPickToOutput(updatedPick!)
  }

  @Mutation(() => BettingPickOutput, {
    name: 'toggleBetPlaced',
    description: 'Toggle betPlaced status on a pick',
  })
  async toggleBetPlaced(
    @Args('pickId', { type: () => ID }) pickId: string
  ): Promise<BettingPickOutput> {
    const pick = await this.bettingPickModel.findById(pickId).exec()
    if (!pick) {
      throw new Error('Pick not found')
    }

    if (pick.betPlaced) {
      return this.unplaceBet(pickId)
    } else {
      return this.placeBet(pickId)
    }
  }

  private mapPickToOutput(pick: BettingPickDocument): BettingPickOutput {
    return {
      id: pick._id.toString(),
      fixtureId: pick.fixtureId,
      date: pick.date,
      league: pick.league as LeagueInfo,
      teamHome: pick.teamHome as BettingTeamInfo,
      teamAway: pick.teamAway as BettingTeamInfo,
      kickoff: pick.kickoff,
      timeWindow: pick.timeWindow,
      market: pick.market,
      marketLabel: getMarketLabel(pick.market),
      direction: pick.direction,
      line: pick.line,
      probOwn: pick.probOwn,
      probImplied: pick.probImplied,
      edge: pick.edge,
      confidenceScore: pick.confidenceScore,
      modelInputs: pick.modelInputs as ModelInputs,
      reasons: pick.reasons,
      stars: pick.stars,
      oddsAtDetection: pick.oddsAtDetection,
      oddsAtBet: pick.oddsAtBet,
      oddsAtClose: pick.oddsAtClose,
      bestBookmaker: pick.bestBookmaker,
      steamMove: pick.steamMove as SteamMoveInfo,
      status: pick.status,
      stake: pick.stake,
      profit: pick.profit,
      clv: pick.clv,
      matchResult: pick.matchResult as MatchResult,
      betPlaced: pick.betPlaced || false,
      betPlacedAt: pick.betPlacedAt,
      betAmount: pick.betAmount,
      createdAt: pick.createdAt,
      updatedAt: pick.updatedAt,
    }
  }
}
