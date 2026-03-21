import { Resolver, Query, Args, Int } from '@nestjs/graphql'
import { MatchesService } from './matches.service'
import {
  LateMatchOptionsDto,
  LiveMatchOutputDto,
  LeagueStandingsDto,
  AvailableLeagueDto,
  FootballSearchResultDto,
  PlayerProfileDto,
} from './dto'

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
    // Must resolve any fixture (upcoming/finished/live) via API-Football + Redis, not only current live list
    return this.matchesService.getMatchById(id)
  }

  @Query(() => LeagueStandingsDto, { name: 'leagueStandings', nullable: true })
  async leagueStandings(
    @Args('leagueId') leagueId: string,
    @Args('season', { type: () => Int, nullable: true }) season?: number
  ) {
    return this.matchesService.getStandings(leagueId, season)
  }

  @Query(() => [AvailableLeagueDto])
  availableLeagues() {
    return this.matchesService.getAvailableLeagues()
  }

  @Query(() => [LiveMatchOutputDto])
  async matchesByLeague(
    @Args('leagueId') leagueId: string,
    @Args('status', { nullable: true, defaultValue: 'all' }) status?: string
  ) {
    return this.matchesService.getMatchesByLeague(leagueId, status)
  }

  @Query(() => [LiveMatchOutputDto])
  async fixturesByDate(
    @Args('date') date: string,
    @Args('leagueId', { nullable: true }) leagueId?: string
  ) {
    return this.matchesService.getFixturesByDate(date, leagueId)
  }

  @Query(() => [FootballSearchResultDto])
  async footballSearch(
    @Args('query') query: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 8 }) limit?: number
  ) {
    return this.matchesService.searchFootball(query, limit ?? 8)
  }

  @Query(() => PlayerProfileDto, { nullable: true })
  async playerProfile(
    @Args('playerId', { type: () => Int }) playerId: number,
    @Args('season', { type: () => Int, nullable: true }) season?: number
  ) {
    return this.matchesService.getPlayerProfile(playerId, season)
  }
}
