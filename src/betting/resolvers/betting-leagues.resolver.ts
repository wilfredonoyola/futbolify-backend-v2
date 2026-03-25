import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql'
import { UseGuards, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { Roles } from '../../auth/roles.decorator'
import { UserRole } from '../../users/schemas/user.schema'
import { BettingLeague, BettingLeagueDocument } from '../schemas/betting-league.schema'
import { BettingLeagueOutput } from '../dto/betting.dto'
import { ApiFootballBettingService } from '../services/api-football-betting.service'

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BettingLeaguesResolver {
  private readonly logger = new Logger(BettingLeaguesResolver.name)

  constructor(
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    private apiFootballService: ApiFootballBettingService
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

  @Mutation(() => BettingLeagueOutput, { name: 'addBettingLeague' })
  async addBettingLeague(
    @Args('apiFootballId', { type: () => Int }) apiFootballId: number,
    @Args('tier', { type: () => Int, defaultValue: 3 }) tier: number,
    @Args('isActive', { defaultValue: false }) isActive: boolean
  ): Promise<BettingLeagueOutput> {
    // Check if league already exists
    const existing = await this.bettingLeagueModel.findOne({ apiFootballId }).exec()
    if (existing) {
      throw new Error(`League with API-Football ID ${apiFootballId} already exists: ${existing.name}`)
    }

    // Fetch league info from API-Football
    const leagueInfo = await this.apiFootballService.getLeagueInfo(apiFootballId)
    if (!leagueInfo) {
      throw new Error(`League with API-Football ID ${apiFootballId} not found in API-Football`)
    }

    // Get season info
    const seasonInfo = await this.apiFootballService.getLeagueSeasonInfo(apiFootballId)

    // Create new league
    const newLeague = await this.bettingLeagueModel.create({
      apiFootballId,
      name: leagueInfo.name,
      country: leagueInfo.country || 'International',
      division: 1,
      tier,
      isActive,
      logo: leagueInfo.logo,
      season: seasonInfo?.season?.toString(),
      seasonStart: seasonInfo?.seasonStart ? new Date(seasonInfo.seasonStart) : undefined,
      seasonEnd: seasonInfo?.seasonEnd ? new Date(seasonInfo.seasonEnd) : undefined,
      coverage: seasonInfo?.coverage ? {
        events: seasonInfo.coverage.fixtures?.events ?? false,
        lineups: seasonInfo.coverage.fixtures?.lineups ?? false,
        statisticsFixtures: seasonInfo.coverage.fixtures?.statistics_fixtures ?? false,
        statisticsPlayers: seasonInfo.coverage.fixtures?.statistics_players ?? false,
        standings: seasonInfo.coverage.standings ?? false,
        players: seasonInfo.coverage.players ?? false,
        topScorers: seasonInfo.coverage.top_scorers ?? false,
        predictions: seasonInfo.coverage.predictions ?? false,
        odds: seasonInfo.coverage.odds ?? false,
      } : undefined,
      stats: {},
      modelConfig: {},
      lastSynced: new Date(),
    })

    this.logger.log(`Added new league: ${newLeague.name} (ID: ${apiFootballId}, Tier: ${tier})`)

    return this.mapLeagueToOutput(newLeague)
  }

  @Mutation(() => Boolean, { name: 'deleteBettingLeague' })
  async deleteBettingLeague(
    @Args('apiFootballId', { type: () => Int }) apiFootballId: number
  ): Promise<boolean> {
    const result = await this.bettingLeagueModel.deleteOne({ apiFootballId }).exec()

    if (result.deletedCount === 0) {
      throw new Error(`League with API-Football ID ${apiFootballId} not found`)
    }

    this.logger.log(`Deleted league with API-Football ID: ${apiFootballId}`)
    return true
  }

  @Mutation(() => BettingLeagueOutput, { name: 'updateLeagueInfo' })
  async updateLeagueInfo(
    @Args('apiFootballId', { type: () => Int }) apiFootballId: number,
    @Args('marketStrengths', { type: () => [String], nullable: true }) marketStrengths?: string[],
    @Args('notes', { nullable: true }) notes?: string
  ): Promise<BettingLeagueOutput> {
    const updateData: Record<string, unknown> = {}

    if (marketStrengths !== undefined) {
      updateData.marketStrengths = marketStrengths
    }
    if (notes !== undefined) {
      updateData.notes = notes
    }

    const league = await this.bettingLeagueModel
      .findOneAndUpdate(
        { apiFootballId },
        { $set: updateData },
        { new: true }
      )
      .exec()

    if (!league) {
      throw new Error('League not found')
    }

    this.logger.log(`Updated league info for ${league.name}: ${JSON.stringify(updateData)}`)
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
      marketStrengths: league.marketStrengths || [],
      notes: league.notes,
    }
  }
}
