import { Resolver, Query, Args } from '@nestjs/graphql';
import { StandingsService } from './standings.service';
import { StandingsDto } from './dto/standing.dto';

@Resolver()
export class StandingsResolver {
  constructor(private readonly standingsService: StandingsService) {}

  /**
   * Get standings for a specific league
   */
  @Query(() => StandingsDto, { name: 'standings', nullable: true })
  async getStandings(
    @Args('leagueId') leagueId: string,
    @Args('season', { nullable: true }) season?: string,
    @Args('conference', { nullable: true }) conference?: string,
  ): Promise<StandingsDto | null> {
    return this.standingsService.getStandings(leagueId, season, conference);
  }

  /**
   * Get MLS standings (returns both conferences)
   */
  @Query(() => [StandingsDto], { name: 'mlsStandings' })
  async getMlsStandings(
    @Args('season', { nullable: true }) season?: string,
  ): Promise<StandingsDto[]> {
    return this.standingsService.getMlsStandings(season);
  }
}
