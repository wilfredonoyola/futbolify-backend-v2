import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { Roles } from '../../auth/roles.decorator'
import { UserRole } from '../../users/schemas/user.schema'
import { BettingLeague, BettingLeagueDocument } from '../schemas/betting-league.schema'
import { BettingLeagueOutput } from '../dto/betting.dto'

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BettingLeaguesResolver {
  constructor(
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>
  ) {}

  @Query(() => [BettingLeagueOutput], { name: 'bettingLeagues' })
  async getBettingLeagues(
    @Args('activeOnly', { nullable: true, defaultValue: false }) activeOnly: boolean,
    @Args('tier', { type: () => Int, nullable: true }) tier?: number
  ): Promise<BettingLeagueOutput[]> {
    const query: Record<string, unknown> = {}

    if (activeOnly) {
      query.isActive = true
    }

    if (tier) {
      query.tier = tier
    }

    const leagues = await this.bettingLeagueModel
      .find(query)
      .sort({ tier: 1, name: 1 })
      .exec()

    return leagues.map((league) => this.mapLeagueToOutput(league))
  }

  @Query(() => BettingLeagueOutput, { name: 'bettingLeague', nullable: true })
  async getBettingLeague(
    @Args('apiFootballId', { type: () => Int }) apiFootballId: number
  ): Promise<BettingLeagueOutput | null> {
    const league = await this.bettingLeagueModel
      .findOne({ apiFootballId })
      .exec()

    if (!league) return null
    return this.mapLeagueToOutput(league)
  }

  @Mutation(() => BettingLeagueOutput, { name: 'toggleBettingLeague' })
  async toggleBettingLeague(
    @Args('apiFootballId', { type: () => Int }) apiFootballId: number,
    @Args('active') active: boolean
  ): Promise<BettingLeagueOutput> {
    const league = await this.bettingLeagueModel
      .findOneAndUpdate(
        { apiFootballId },
        { $set: { isActive: active } },
        { new: true }
      )
      .exec()

    if (!league) {
      throw new Error('League not found')
    }

    return this.mapLeagueToOutput(league)
  }

  @Mutation(() => BettingLeagueOutput, { name: 'updateLeagueTier' })
  async updateLeagueTier(
    @Args('apiFootballId', { type: () => Int }) apiFootballId: number,
    @Args('tier', { type: () => Int }) tier: number
  ): Promise<BettingLeagueOutput> {
    if (tier < 1 || tier > 4) {
      throw new Error('Tier must be between 1 and 4')
    }

    const league = await this.bettingLeagueModel
      .findOneAndUpdate(
        { apiFootballId },
        { $set: { tier } },
        { new: true }
      )
      .exec()

    if (!league) {
      throw new Error('League not found')
    }

    return this.mapLeagueToOutput(league)
  }

  private mapLeagueToOutput(league: BettingLeagueDocument): BettingLeagueOutput {
    return {
      id: league._id.toString(),
      apiFootballId: league.apiFootballId,
      name: league.name,
      country: league.country,
      logo: league.logo,
      tier: league.tier,
      isActive: league.isActive,
      season: league.season,
      fixturesAnalyzed: league.fixturesAnalyzed || 0,
      picksGenerated: league.picksGenerated || 0,
    }
  }
}
