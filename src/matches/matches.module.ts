import { Module } from '@nestjs/common'

import { MatchesResolver } from './matches.resolver'
import { MatchesService } from './matches.service'
import { CacheService } from './cache.service'
import { OpenAiAnalysisService } from './openai-analysis.service'

@Module({
  providers: [
    MatchesService,
    MatchesResolver,
    CacheService,
    OpenAiAnalysisService,
  ],
})
export class MatchesModule {}
