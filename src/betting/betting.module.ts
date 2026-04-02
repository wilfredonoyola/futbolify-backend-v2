import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import {
  BettingLeague,
  BettingLeagueSchema,
  BettingPick,
  BettingPickSchema,
  BettingCombo,
  BettingComboSchema,
  BettingDailySummary,
  BettingDailySummarySchema,
  BettingSettings,
  BettingSettingsSchema,
  AnalyzedFixture,
  AnalyzedFixtureSchema,
} from './schemas'

import {
  // Phase 2: API Wrappers
  ApiFootballBettingService,
  OddsApiService,
  OpenMeteoService,
  // Phase 3: Scoring Services
  ScoringGoalsService,
  ScoringCornersService,
  ScoringCardsService,
  ContextService,
  // Phase 4: Value Detection + Combo Engine
  ValueDetectionService,
  CorrelationService,
  ComboEngineService,
  PortfolioOptimizerService,
  AntiPatternService,
  StakeCalculatorService,
} from './services'

import {
  // Phase 5: Cron Jobs
  LeagueSyncCron,
  StatsUpdaterCron,
  NightlyAnalysisCron,
  PreMatchCheckCron,
  OddsMonitorCron,
  ResultCollectorCron,
  DailySummaryCron,
  WeeklyReportCron,
} from './cron'

import { BettingTelegramModule } from './telegram'

import {
  // Phase 7: GraphQL Resolvers
  BettingPicksResolver,
  BettingCombosResolver,
  BettingAnalyticsResolver,
  BettingSettingsResolver,
  BettingLeaguesResolver,
} from './resolvers'

import { BettingTestController } from './betting-test.controller'

@Module({
  imports: [
    // ScheduleModule ya está registrado globalmente en AppModule
    MongooseModule.forFeature([
      { name: BettingLeague.name, schema: BettingLeagueSchema },
      { name: BettingPick.name, schema: BettingPickSchema },
      { name: BettingCombo.name, schema: BettingComboSchema },
      { name: BettingDailySummary.name, schema: BettingDailySummarySchema },
      { name: BettingSettings.name, schema: BettingSettingsSchema },
      { name: AnalyzedFixture.name, schema: AnalyzedFixtureSchema },
    ]),
    // Phase 6: Telegram Integration
    BettingTelegramModule,
  ],
  controllers: [BettingTestController],
  providers: [
    // Phase 2: API Wrappers
    ApiFootballBettingService,
    OddsApiService,
    OpenMeteoService,
    // Phase 3: Scoring Services
    ScoringGoalsService,
    ScoringCornersService,
    ScoringCardsService,
    ContextService,
    // Phase 4: Value Detection + Combo Engine
    ValueDetectionService,
    CorrelationService,
    ComboEngineService,
    PortfolioOptimizerService,
    AntiPatternService,
    StakeCalculatorService,
    // Phase 5: Cron Jobs
    LeagueSyncCron,
    StatsUpdaterCron,
    NightlyAnalysisCron,
    PreMatchCheckCron,
    OddsMonitorCron,
    ResultCollectorCron,
    DailySummaryCron,
    WeeklyReportCron,
    // Phase 7: GraphQL Resolvers
    BettingPicksResolver,
    BettingCombosResolver,
    BettingAnalyticsResolver,
    BettingSettingsResolver,
    BettingLeaguesResolver,
  ],
  exports: [
    // Phase 2: API Wrappers
    ApiFootballBettingService,
    OddsApiService,
    OpenMeteoService,
    // Phase 3: Scoring Services
    ScoringGoalsService,
    ScoringCornersService,
    ScoringCardsService,
    ContextService,
    // Phase 4: Value Detection + Combo Engine
    ValueDetectionService,
    CorrelationService,
    ComboEngineService,
    PortfolioOptimizerService,
    AntiPatternService,
    StakeCalculatorService,
    // Phase 5: Cron Jobs
    LeagueSyncCron,
    StatsUpdaterCron,
    NightlyAnalysisCron,
    PreMatchCheckCron,
    OddsMonitorCron,
    ResultCollectorCron,
    DailySummaryCron,
    WeeklyReportCron,
  ],
})
export class BettingModule {}
