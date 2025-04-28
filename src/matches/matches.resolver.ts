import { Resolver, Query } from '@nestjs/graphql';
import { MatchesService } from './matches.service';
import { MatchOutputDto } from './dto';

@Resolver(() => MatchOutputDto)
export class MatchesResolver {
  constructor(private readonly matchesService: MatchesService) {}

  @Query(() => [MatchOutputDto])
  liveMatches() {
    return this.matchesService.getLiveMatches();
  }
}
