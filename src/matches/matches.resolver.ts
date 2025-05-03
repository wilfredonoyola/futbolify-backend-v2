import { Resolver, Query, Args, Int, Mutation } from '@nestjs/graphql'
import { MatchesService } from './matches.service'
import {
  LateMatchOptionsDto,
  LiveMatchOutputDto,
  LiveMatchPublicViewDto,
  PredictionAccuracyStatsDto,
  PredictionRecordDto,
} from './dto'
import { PredictionStorageService } from './prediction-storage.service'

@Resolver('Match')
export class MatchesResolver {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly predictionStorageService: PredictionStorageService
  ) {}

  @Query(() => [LiveMatchOutputDto])
  async liveMatches() {
    return this.matchesService.getLiveMatchesSimple()
  }

  @Query(() => [LiveMatchOutputDto])
  async lateMatches(
    @Args('options', { nullable: true }) options?: LateMatchOptionsDto
  ) {
    return this.matchesService.getLateMatches(options || {})
  }

  @Query(() => LiveMatchOutputDto, { nullable: true })
  async matchById(@Args('id') id: number) {
    const matches = await this.matchesService.getLiveMatchesSimple()
    return matches.find((match) => match.id === id) || null
  }

  @Query(() => [PredictionRecordDto])
  async getPredictionHistory(
    @Args('matchId', { type: () => Int }) matchId: number
  ): Promise<PredictionRecordDto[]> {
    return this.predictionStorageService.findByMatchId(matchId)
  }

  @Query(() => [PredictionRecordDto])
  async getAllPredictions(): Promise<PredictionRecordDto[]> {
    return this.predictionStorageService.findAll()
  }

  @Mutation(() => Int)
  async validatePredictionsBatch(): Promise<number> {
    return this.predictionStorageService.validatePendingPredictions()
  }

  @Query(() => PredictionAccuracyStatsDto)
  async getPredictionAccuracyStats(): Promise<PredictionAccuracyStatsDto> {
    return this.predictionStorageService.getAccuracyStats()
  }

  @Query(() => [LiveMatchPublicViewDto])
  async predictedLiveMatches(): Promise<LiveMatchPublicViewDto[]> {
    return this.matchesService.getRecentSniperViewFromStorage()
  }
}
