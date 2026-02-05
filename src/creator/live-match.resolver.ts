import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { LiveMatchService } from './live-match.service';
import { LiveMatchResponse } from './dto/live-match.output';

@Resolver()
export class LiveMatchResolver {
  constructor(private readonly liveMatchService: LiveMatchService) {}

  /**
   * Get live match data by fixture ID
   */
  @Query(() => LiveMatchResponse)
  @UseGuards(GqlAuthGuard)
  async liveMatch(
    @Args('fixtureId', { type: () => Int }) fixtureId: number
  ): Promise<LiveMatchResponse> {
    try {
      const { match, cachedAt, cacheExpiresIn } = await this.liveMatchService.getLiveMatch(fixtureId);

      if (!match) {
        return {
          success: false,
          error: 'Match not found',
          cachedAt: new Date(),
          cacheExpiresIn: 0,
        };
      }

      return {
        success: true,
        match,
        cachedAt,
        cacheExpiresIn,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        cachedAt: new Date(),
        cacheExpiresIn: 0,
      };
    }
  }

  /**
   * Get current live fixture ID for a team
   */
  @Query(() => Int, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async liveFixtureId(
    @Args('teamApiId', { type: () => Int }) teamApiId: number
  ): Promise<number | null> {
    return this.liveMatchService.getLiveFixtureId(teamApiId);
  }
}
