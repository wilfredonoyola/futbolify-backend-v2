import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql'
import { GoalGuruService } from './goal-guru.service'
import {
  GoalGuruLeagueDto,
  GoalGuruMatchDto,
  MatchContextDto,
  MatchContextInput,
  AnalysisResultDto,
  AnalyzeMatchesInput,
  GoalGuruPickDto,
  MarkResultInput,
  GoalGuruStatsDto,
} from './dto'

@Resolver('GoalGuru')
export class GoalGuruResolver {
  constructor(private readonly goalGuruService: GoalGuruService) {}

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

  @Query(() => MatchContextDto, {
    name: 'getGoalGuruMatchContext',
    nullable: true,
  })
  async getMatchContext(
    @Args('input') input: MatchContextInput
  ): Promise<MatchContextDto | null> {
    return this.goalGuruService.getMatchContext(input)
  }

  @Query(() => [GoalGuruPickDto], { name: 'goalGuruHistory' })
  async getHistory(
    @Args('limit', { type: () => Int, nullable: true }) limit: number,
    @Args('offset', { type: () => Int, nullable: true }) offset: number
  ): Promise<GoalGuruPickDto[]> {
    // TODO: Re-enable auth and use user.userId when auth is properly configured
    return this.goalGuruService.getHistory('anonymous', limit || 50, offset || 0)
  }

  @Query(() => GoalGuruStatsDto, { name: 'goalGuruStats' })
  async getStats(): Promise<GoalGuruStatsDto> {
    // TODO: Re-enable auth and use user.userId when auth is properly configured
    return this.goalGuruService.getStats('anonymous')
  }

  @Mutation(() => AnalysisResultDto, {
    name: 'analyzeGoalGuruMatches',
    nullable: true,
  })
  async analyzeMatches(
    @Args('input') input: AnalyzeMatchesInput
  ): Promise<AnalysisResultDto | null> {
    return this.goalGuruService.tripleAnalysis(input)
  }

  @Mutation(() => GoalGuruPickDto, { name: 'markGoalGuruPickResult' })
  async markPickResult(
    @Args('input') input: MarkResultInput
  ): Promise<GoalGuruPickDto> {
    // TODO: Re-enable auth and use user.userId when auth is properly configured
    return this.goalGuruService.markPickResult('anonymous', input)
  }

  @Mutation(() => Boolean, { name: 'clearGoalGuruHistory' })
  async clearHistory(): Promise<boolean> {
    // TODO: Re-enable auth and use user.userId when auth is properly configured
    return this.goalGuruService.clearHistory('anonymous')
  }
}
