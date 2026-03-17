import { Resolver, Query, Args, Int } from '@nestjs/graphql'
import { MatchesService } from './matches.service'
import { LateMatchOptionsDto, LiveMatchOutputDto, LeagueStandingsDto, AvailableLeagueDto } from './dto'

@Resolver('Match')
export class MatchesResolver {
  constructor(private readonly matchesService: MatchesService) {}

  @Query(() => [LiveMatchOutputDto])
  async liveMatches() {
    return this.matchesService.getLiveMatchesSimple()
  }

  @Query(() => [LiveMatchOutputDto])
  async lateMatches(
    @Args('options', { nullable: true }) options?: LateMatchOptionsDto
  ) {
    return this.matchesService.getLateMatches(options || {})
  }

  @Query(() => [LiveMatchOutputDto])
  async upcomingMatches() {
    return this.matchesService.getUpcomingMatches()
  }

  @Query(() => LiveMatchOutputDto, { nullable: true })
  async matchById(@Args('id') id: number) {
    const matches = await this.matchesService.getLiveMatchesSimple()
    return matches.find((match) => match.id === id) || null
  }

  @Query(() => LeagueStandingsDto, { nullable: true })
  async standings(
    @Args('leagueId') leagueId: string,
    @Args('season', { type: () => Int, nullable: true }) season?: number
  ) {
    return this.matchesService.getStandings(leagueId, season)
  }

  @Query(() => [AvailableLeagueDto])
  availableLeagues() {
    return this.matchesService.getAvailableLeagues()
  }
}
