import { Field, Float, Int, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class HistoricalSupportDto {
  @Field(() => Int)
  similarMatches: number

  @Field(() => Int)
  withGoals: number

  @Field(() => Float)
  percentage: number

  @Field()
  comment: string
}

@ObjectType()
export class FullPredictionResultDto {
  @Field(() => Int)
  matchId: number

  @Field(() => Float)
  liveProbability: number

  @Field(() => HistoricalSupportDto)
  historicalSupport: HistoricalSupportDto

  @Field(() => Float)
  finalProbability: number

  @Field()
  confidence: 'low' | 'moderate' | 'high'

  @Field()
  reasoning: string
}
