import { Module } from '@nestjs/common'

import { MatchesResolver } from './matches.resolver'
import { MatchesService } from './matches.service'
import { ApiFootballLiveService } from './api-football-live.service'
import { OpenAiAnalysisService } from './openai-analysis.service'

@Module({
  providers: [
    MatchesService,
    MatchesResolver,
    ApiFootballLiveService,
    OpenAiAnalysisService,
  ],
})
export class MatchesModule {}
