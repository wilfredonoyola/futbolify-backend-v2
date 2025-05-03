import { ObjectType, Field, Int, Float, ID } from '@nestjs/graphql'

@ObjectType()
export class PredictionRecordDto {
  @Field(() => ID)
  id: string

  @Field(() => Int)
  matchId: number

  @Field(() => Int)
  minute: number

  @Field(() => Int)
  scoreHome: number

  @Field(() => Int)
  scoreAway: number

  @Field(() => Float)
  pressureScore: number

  @Field(() => Float)
  recentActivityScore: number

  @Field(() => Float)
  liveProbability: number

  @Field(() => Float)
  finalProbability: number

  @Field({ nullable: true })
  historicalComment?: string

  @Field(() => Boolean)
  goalOccurred: boolean

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date
}
