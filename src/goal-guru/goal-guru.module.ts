import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { GoalGuruResolver } from './goal-guru.resolver'
import { GoalGuruService } from './goal-guru.service'
import { AnthropicService } from './anthropic.service'
import { ApiFootballService } from './api-football.service'
import { FootballDataService } from './football-data.service'
import { OddsApiService } from './odds-api.service'

// FHG-ENGINE schemas
import { FhgLeague, FhgLeagueSchema } from './schemas/fhg-league.schema'
import { FhgTeam, FhgTeamSchema } from './schemas/fhg-team.schema'
import { FhgMatch, FhgMatchSchema } from './schemas/fhg-match.schema'
import { FhgOdds, FhgOddsSchema } from './schemas/fhg-odds.schema'
import {
  FhgPrediction,
  FhgPredictionSchema,
} from './schemas/fhg-prediction.schema'
import {
  FhgSelection,
  FhgSelectionSchema,
} from './schemas/fhg-selection.schema'
import { FhgHealth, FhgHealthSchema } from './schemas/fhg-health.schema'
import { FhgLog, FhgLogSchema } from './schemas/fhg-log.schema'

// FHG-ENGINE services
import { FhgLogService } from './services/fhg-log.service'
import { FhgPredictionService } from './services/fhg-prediction.service'
import { FhgValueService } from './services/fhg-value.service'
import { FhgSelectionService } from './services/fhg-selection.service'
import { FhgHealthService } from './services/fhg-health.service'
import { FhgDataService } from './services/fhg-data.service'
import { FhgSchedulerService } from './services/fhg-scheduler.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      // FHG-ENGINE schemas
      { name: FhgLeague.name, schema: FhgLeagueSchema },
      { name: FhgTeam.name, schema: FhgTeamSchema },
      { name: FhgMatch.name, schema: FhgMatchSchema },
      { name: FhgOdds.name, schema: FhgOddsSchema },
      { name: FhgPrediction.name, schema: FhgPredictionSchema },
      { name: FhgSelection.name, schema: FhgSelectionSchema },
      { name: FhgHealth.name, schema: FhgHealthSchema },
      { name: FhgLog.name, schema: FhgLogSchema },
    ]),
  ],
  providers: [
    // Core services
    GoalGuruResolver,
    GoalGuruService,
    AnthropicService,
    ApiFootballService,
    FootballDataService,
    OddsApiService,
    // FHG-ENGINE services
    FhgLogService,
    FhgPredictionService,
    FhgValueService,
    FhgSelectionService,
    FhgHealthService,
    FhgDataService,
    FhgSchedulerService,
  ],
  exports: [GoalGuruService, FhgSelectionService, FhgHealthService, FhgDataService],
})
export class GoalGuruModule {}
