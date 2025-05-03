import { Module } from '@nestjs/common'

import { MatchesResolver } from './matches.resolver'
import { MatchesService } from './matches.service'
import { CacheService } from './cache.service'
import { OpenAiAnalysisService } from './openai-analysis.service'
import { MongooseModule } from '@nestjs/mongoose'
import { PredictionRecordSchema } from './schemas/prediction-record.schema'
import { PredictionStorageService } from './prediction-storage.service'
import { PredictionEngineService } from './prediction-engine.service'
import { PredictionCronService } from './prediction-cron.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'PredictionRecord', schema: PredictionRecordSchema },
    ]),
  ],

  providers: [
    MatchesService,
    MatchesResolver,
    CacheService,
    OpenAiAnalysisService,
    PredictionStorageService,
    PredictionEngineService,
    PredictionCronService,
  ],
})
export class MatchesModule {}
