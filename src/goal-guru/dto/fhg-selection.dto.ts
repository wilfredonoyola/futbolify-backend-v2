import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql'
import { FhgSignal } from '../enums/fhg-signal.enum'
import { FhgOutcome } from '../enums/fhg-outcome.enum'

@ObjectType()
export class FhgSelectionDto {
  @Field(() => ID)
  id: string

  @Field(() => ID)
  matchId: string

  @Field(() => ID)
  predictionId: string

  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field()
  leagueCode: string

  @Field()
  date: Date

  @Field()
  kickoffTime: string

  @Field(() => FhgSignal)
  signal: FhgSignal

  @Field(() => Float)
  marginValor: number

  @Field(() => Float)
  pReal: number

  @Field(() => Int)
  edgeScore: number

  @Field(() => Float)
  stakePercentage: number

  @Field(() => Float)
  oddsAtSelection: number

  @Field({ nullable: true })
  bookmakerUsed?: string

  @Field(() => FhgOutcome)
  outcome: FhgOutcome

  @Field(() => Float, { nullable: true })
  closingOdds?: number

  @Field(() => Float, { nullable: true })
  clv?: number

  @Field(() => Float, { nullable: true })
  profitLoss?: number

  @Field({ nullable: true })
  settledAt?: Date

  @Field(() => Int, { nullable: true })
  actualGoals1H?: number

  @Field(() => Int, { nullable: true })
  minuteFirstGoal?: number

  @Field()
  createdAt: Date
}

@ObjectType()
export class FhgSelectionHistoryDto {
  @Field(() => [FhgSelectionDto])
  selections: FhgSelectionDto[]

  @Field(() => Int)
  total: number

  @Field(() => Int)
  offset: number

  @Field(() => Int)
  limit: number
}
