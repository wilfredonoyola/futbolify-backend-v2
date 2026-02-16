import { Resolver, Query, Mutation, Args, Int, ID } from '@nestjs/graphql'
import { GoalGuruService } from './goal-guru.service'
import {
  GoalGuruLeagueDto,
  GoalGuruMatchDto,
  AnalysisResultDto,
  // FHG-ENGINE DTOs
  FhgSelectionDto,
  FhgSelectionHistoryDto,
  FhgPredictionDetailDto,
  FhgHealthDto,
  DailyPipelineResultDto,
  SettlementResultDto,
  RefreshResultDto,
  FhgMatchCandidateDto,
  FhgPipelineOptionsInput,
  FhgLogEntryDto,
  FhgLogFilterInput,
  FhgLeagueDto,
} from './dto'

// FHG-ENGINE services
import { FhgSelectionService } from './services/fhg-selection.service'
import { FhgHealthService } from './services/fhg-health.service'
import { FhgPredictionService } from './services/fhg-prediction.service'
import { FhgLogService } from './services/fhg-log.service'
import { FhgDataService } from './services/fhg-data.service'
import { FhgLogCategory } from './enums/fhg-log-category.enum'
import { getActiveFhgLeagues } from './constants/fhg-config'

/**
 * Input for G1H analysis
 */
import { InputType, Field } from '@nestjs/graphql'

@InputType()
export class G1HMatchInput {
  @Field()
  home: string

  @Field()
  away: string

  @Field()
  date: string

  @Field()
  time: string

  @Field()
  comp: string
}

@InputType()
export class AnalyzeG1HInput {
  @Field(() => [G1HMatchInput])
  matches: G1HMatchInput[]

  @Field()
  leagueName: string
}

@Resolver('GoalGuru')
export class GoalGuruResolver {
  constructor(
    private readonly goalGuruService: GoalGuruService,
    private readonly fhgSelectionService: FhgSelectionService,
    private readonly fhgHealthService: FhgHealthService,
    private readonly fhgPredictionService: FhgPredictionService,
    private readonly fhgLogService: FhgLogService,
    private readonly fhgDataService: FhgDataService
  ) {}

  // ============================================
  // CORE QUERIES (for match discovery)
  // ============================================

  @Query(() => [GoalGuruLeagueDto], { name: 'goalGuruLeagues' })
  getLeagues(): GoalGuruLeagueDto[] {
    return this.goalGuruService.getLeagues()
  }

  @Query(() => [GoalGuruMatchDto], { name: 'findGoalGuruMatches' })
  async findMatches(
    @Args('leagueId') leagueId: string
  ): Promise<GoalGuruMatchDto[]> {
    return this.goalGuruService.findMatches(leagueId)
  }

  // ============================================
  // FHG-ENGINE QUERIES
  // ============================================

  @Query(() => [FhgSelectionDto], {
    name: 'fhgTodaySelections',
    description: 'Get FHG selections for today',
  })
  async fhgTodaySelections(): Promise<FhgSelectionDto[]> {
    return this.fhgSelectionService.getTodaySelections()
  }

  @Query(() => [FhgSelectionDto], {
    name: 'fhgSelectionsByDate',
    description: 'Get FHG selections for a specific date (YYYY-MM-DD)',
  })
  async fhgSelectionsByDate(
    @Args('date') date: string
  ): Promise<FhgSelectionDto[]> {
    return this.fhgSelectionService.getSelectionsByDate(date)
  }

  @Query(() => [FhgSelectionDto], {
    name: 'fhgSelectionsThisWeek',
    description: 'Get FHG selections for current week (Monday to Sunday)',
  })
  async fhgSelectionsThisWeek(): Promise<FhgSelectionDto[]> {
    return this.fhgSelectionService.getSelectionsThisWeek()
  }

  @Query(() => FhgSelectionHistoryDto, {
    name: 'fhgSelectionHistory',
    description: 'Get paginated FHG selection history',
  })
  async fhgSelectionHistory(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('offset', { type: () => Int, nullable: true }) offset?: number
  ): Promise<FhgSelectionHistoryDto> {
    return this.fhgSelectionService.getSelectionHistory(limit || 50, offset || 0)
  }

  @Query(() => FhgHealthDto, {
    name: 'fhgHealthReport',
    description: 'Get the latest FHG health report with CLV metrics',
  })
  async fhgHealthReport(): Promise<FhgHealthDto> {
    const report = await this.fhgHealthService.getLatestHealthReport()
    if (!report) {
      return this.fhgHealthService.generateHealthReport()
    }
    return report
  }

  @Query(() => [FhgLeagueDto], {
    name: 'fhgActiveLeagues',
    description: 'Get active leagues for FHG analysis',
  })
  fhgActiveLeagues(): FhgLeagueDto[] {
    const leagues = getActiveFhgLeagues()
    return leagues.map((l) => ({
      id: l.code,
      code: l.code,
      name: l.name,
      tier: l.tier,
      avgG1H: l.avgG1H,
      apiFootballId: l.apiFootballId,
      footballDataCode: l.footballDataCode,
      active: l.active,
    }))
  }

  @Query(() => [FhgMatchCandidateDto], {
    name: 'fhgMatchCandidates',
    description: 'Get match candidates for analysis (with predictions and odds status)',
  })
  async fhgMatchCandidates(
    @Args('date', { nullable: true }) date?: string
  ): Promise<FhgMatchCandidateDto[]> {
    return this.fhgSelectionService.getMatchCandidates(date)
  }

  @Query(() => FhgPredictionDetailDto, {
    name: 'fhgMatchPrediction',
    nullable: true,
    description: 'Get detailed prediction for a specific match',
  })
  async fhgMatchPrediction(
    @Args('matchId', { type: () => ID }) matchId: string
  ): Promise<FhgPredictionDetailDto | null> {
    return this.fhgPredictionService.getPredictionByMatchId(matchId)
  }

  @Query(() => [FhgLogEntryDto], {
    name: 'fhgRecentLogs',
    description: 'Get recent FHG logs for transparency',
  })
  fhgRecentLogs(
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('category', { nullable: true }) category?: string
  ): FhgLogEntryDto[] {
    const cat = category
      ? (category as FhgLogCategory)
      : undefined
    return this.fhgLogService.getRecentLogs(limit || 100, cat)
  }

  @Query(() => [FhgLogEntryDto], {
    name: 'fhgLogs',
    description: 'Get FHG logs with filters',
  })
  async fhgLogs(
    @Args('filter', { nullable: true }) filter?: FhgLogFilterInput
  ): Promise<FhgLogEntryDto[]> {
    return this.fhgLogService.getLogs(filter || {})
  }

  // ============================================
  // G1H ANALYSIS MUTATIONS
  // ============================================

  @Mutation(() => AnalysisResultDto, {
    name: 'analyzeSingleG1H',
    nullable: true,
    description: 'Analyze ONE match for G1H',
  })
  async analyzeSingleG1H(
    @Args('input') input: AnalyzeG1HInput
  ): Promise<AnalysisResultDto | null> {
    const singleMatch = input.matches[0]
    if (!singleMatch) return null

    return this.goalGuruService.analyzeSingleMatch({
      match: singleMatch,
      leagueName: input.leagueName,
    })
  }

  @Mutation(() => AnalysisResultDto, {
    name: 'analyzeG1H',
    nullable: true,
    description: 'Analyze ALL matches for G1H - batch analysis',
  })
  async analyzeG1H(
    @Args('input') input: AnalyzeG1HInput
  ): Promise<AnalysisResultDto | null> {
    return this.goalGuruService.analyzeG1H({
      matches: input.matches,
      leagueName: input.leagueName,
    })
  }

  // ============================================
  // FHG-ENGINE MUTATIONS
  // ============================================

  @Mutation(() => DailyPipelineResultDto, {
    name: 'fhgRunDailyPipeline',
    description:
      'Run the FHG daily pipeline: fetch matches, generate predictions, evaluate value, create selections',
  })
  async fhgRunDailyPipeline(
    @Args('options', { nullable: true }) options?: FhgPipelineOptionsInput
  ): Promise<DailyPipelineResultDto> {
    return this.fhgSelectionService.runDailyPipeline(options)
  }

  @Mutation(() => SettlementResultDto, {
    name: 'fhgSettleSelections',
    description: 'Settle pending FHG selections (calculate outcomes and CLV)',
  })
  async fhgSettleSelections(): Promise<SettlementResultDto> {
    return this.fhgSelectionService.settleSelections()
  }

  @Mutation(() => RefreshResultDto, {
    name: 'fhgRefreshMatches',
    description: 'Import/refresh matches from API-Football for all active leagues',
  })
  async fhgRefreshMatches(
    @Args('date', { nullable: true }) date?: string,
    @Args('daysAhead', { type: () => Int, nullable: true, defaultValue: 7 }) daysAhead?: number
  ): Promise<RefreshResultDto> {
    return this.fhgDataService.importMatches(date, daysAhead)
  }

  @Mutation(() => RefreshResultDto, {
    name: 'fhgRefreshTeamStats',
    description: 'Refresh team statistics for FHG analysis',
  })
  async fhgRefreshTeamStats(
    @Args('leagueCode', { nullable: true }) leagueCode?: string
  ): Promise<RefreshResultDto> {
    return this.fhgDataService.refreshTeamStats(leagueCode)
  }

  @Mutation(() => RefreshResultDto, {
    name: 'fhgRefreshOdds',
    description: 'Refresh odds for FHG matches',
  })
  async fhgRefreshOdds(
    @Args('matchId', { type: () => ID, nullable: true }) matchId?: string
  ): Promise<RefreshResultDto> {
    return this.fhgDataService.importOdds(matchId)
  }

  @Mutation(() => RefreshResultDto, {
    name: 'fhgFullRefresh',
    description: 'Full data refresh: matches + odds for all active leagues',
  })
  async fhgFullRefresh(
    @Args('date', { nullable: true }) date?: string,
    @Args('daysAhead', { type: () => Int, nullable: true, defaultValue: 7 }) daysAhead?: number
  ): Promise<RefreshResultDto> {
    return this.fhgDataService.fullRefresh(date, daysAhead)
  }
}
