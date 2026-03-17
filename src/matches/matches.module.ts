import { Module } from '@nestjs/common'

import { MatchesResolver } from './matches.resolver'
import { MatchesService } from './matches.service'
import { ApiFootballLiveService } from './api-football-live.service'
import { OpenAiAnalysisService } from './openai-analysis.service'
import {
  MatchEventDetectorService,
  NotificationService,
  MatchEventsScheduler,
} from './events'

@Module({
  providers: [
    // Core services
    MatchesService,
    MatchesResolver,
    ApiFootballLiveService,
    OpenAiAnalysisService,
    // Event detection & notifications
    MatchEventDetectorService,
    NotificationService,
    MatchEventsScheduler,
  ],
  exports: [
    MatchesService,
    ApiFootballLiveService,
    MatchEventDetectorService,
    NotificationService,
  ],
})
export class MatchesModule {}
