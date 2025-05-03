import { ObjectType, Field, Float, Int } from '@nestjs/graphql'

@ObjectType()
export class AccuracyByRangeDto {
  @Field() range: string
  @Field(() => Int) count: number
  @Field(() => Int) correct: number
  @Field(() => Float) accuracy: number
}

@ObjectType()
export class AccuracyByScoreDto {
  @Field() score: string
  @Field(() => Int) total: number
  @Field(() => Int) correct: number
  @Field(() => Float) accuracy: number
}

@ObjectType()
export class PredictionAccuracyStatsDto {
  @Field(() => Int) totalPredictions: number
  @Field(() => Int) totalCorrect: number
  @Field(() => Float) accuracyGlobal: number

  @Field(() => [AccuracyByRangeDto])
  byFinalProbability: AccuracyByRangeDto[]

  @Field(() => [AccuracyByScoreDto])
  byScore: AccuracyByScoreDto[]
}
