import { Module } from '@nestjs/common'
import { MatchesService } from './matches.service'
import { MatchesResolver } from './matches.resolver'
import { SportmonksService } from './sportmonks.service'
import { MatchesServiceSofascore } from './sofascore.service'
import { CacheService } from './cache.service'

@Module({
  providers: [
    MatchesService,
    SportmonksService,
    MatchesResolver,
    MatchesServiceSofascore,
    CacheService,
  ],
})
export class MatchesModule {}
