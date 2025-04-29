import { Resolver, Query, Args } from '@nestjs/graphql'
import { MatchesService } from './matches.service'
import { LiveMatchOutputDto } from './dto/live-match-output.dto' // DTO que ya tienes
import { LiveMatchForGptDto, MatchAnalysisOutputDto } from './dto'
import { SportmonksService } from './sportmonks.service'
import { MatchesServiceSofascore } from './sofascore.service'

@Resolver()
export class MatchesResolver {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly sportmonksService: SportmonksService,
    private readonly sofaScoreService: MatchesServiceSofascore
  ) {}

  @Query(() => [LiveMatchOutputDto])
  liveMatchesDetailed() {
    return this.sofaScoreService.getLiveMatchesSimple()
  }

  @Query(() => MatchAnalysisOutputDto)
  async analyzeMatch(@Args('fixtureId') fixtureId: number) {
    return this.matchesService.analyzeSingleMatch(fixtureId)
  }
}
