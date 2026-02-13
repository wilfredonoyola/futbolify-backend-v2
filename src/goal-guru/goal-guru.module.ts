import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { GoalGuruResolver } from './goal-guru.resolver'
import { GoalGuruService } from './goal-guru.service'
import { AnthropicService } from './anthropic.service'
import { ApiFootballService } from './api-football.service'
import { OddsApiService } from './odds-api.service'
import {
  GoalGuruPick,
  GoalGuruPickSchema,
} from './schemas/goal-guru-pick.schema'
import {
  GoalGuruSession,
  GoalGuruSessionSchema,
} from './schemas/goal-guru-session.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoalGuruPick.name, schema: GoalGuruPickSchema },
      { name: GoalGuruSession.name, schema: GoalGuruSessionSchema },
    ]),
  ],
  providers: [
    GoalGuruResolver,
    GoalGuruService,
    AnthropicService,
    ApiFootballService,
    OddsApiService,
  ],
  exports: [GoalGuruService],
})
export class GoalGuruModule {}
