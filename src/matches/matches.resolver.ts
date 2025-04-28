import { Resolver, Query } from '@nestjs/graphql'
import { MatchesService } from './matches.service'
import { LiveMatchOutputDto } from './dto'

@Resolver(() => LiveMatchOutputDto)
export class MatchesResolver {
  constructor(private readonly matchesService: MatchesService) {}

  @Query(() => [LiveMatchOutputDto])
  liveMatches() {
    return this.matchesService.getLiveMatchesSimple()
  }
}
