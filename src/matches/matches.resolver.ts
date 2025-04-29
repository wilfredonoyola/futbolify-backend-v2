import { Resolver, Query, Args } from '@nestjs/graphql'
import { MatchesService } from './matches.service'
import { LateMatchOptionsDto, LiveMatchOutputDto } from './dto'

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

  @Query(() => LiveMatchOutputDto, { nullable: true })
  async matchById(@Args('id') id: number) {
    const matches = await this.matchesService.getLiveMatchesSimple()
    return matches.find((match) => match.id === id) || null
  }
}
