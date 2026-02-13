import { ObjectType, Field, Int, Float } from '@nestjs/graphql'

@ObjectType()
export class GoalGuruStatsDto {
  @Field(() => Int)
  totalBets: number

  @Field(() => Int)
  wins: number

  @Field(() => Int)
  losses: number

  @Field(() => Float)
  winRate: number

  @Field(() => Float)
  totalProfit: number

  @Field(() => Float)
  roi: number
}
