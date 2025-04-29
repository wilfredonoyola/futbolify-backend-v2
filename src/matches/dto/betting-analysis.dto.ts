import { ObjectType, Field, Int, Float } from '@nestjs/graphql'

@ObjectType()
export class BettingAnalysisDto {
  @Field()
  recommendedBet: string

  @Field(() => Int)
  confidence: number

  @Field()
  reason: string

  @Field(() => Float)
  odds: number

  @Field()
  timestamp: string
}
