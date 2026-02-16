import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql'
import { FhgStatus } from '../enums/fhg-status.enum'

@ObjectType()
export class FhgLeagueMetricsDto {
  @Field()
  leagueCode: string

  @Field()
  leagueName: string

  @Field(() => Int)
  totalSelections: number

  @Field(() => Int)
  won: number

  @Field(() => Int)
  lost: number

  @Field(() => Float)
  hitRate: number

  @Field(() => Float)
  avgClv: number

  @Field(() => Float)
  roi: number
}

@ObjectType()
export class FhgSignalMetricsDto {
  @Field()
  signal: string

  @Field(() => Int)
  totalSelections: number

  @Field(() => Int)
  won: number

  @Field(() => Int)
  lost: number

  @Field(() => Float)
  hitRate: number

  @Field(() => Float)
  avgClv: number

  @Field(() => Float)
  roi: number
}

@ObjectType()
export class FhgAlertDto {
  @Field()
  severity: string

  @Field()
  message: string

  @Field()
  recommendation: string
}

@ObjectType()
export class FhgHealthDto {
  @Field(() => ID)
  id: string

  @Field(() => FhgStatus)
  status: FhgStatus

  @Field()
  reportDate: Date

  @Field()
  periodStart: Date

  @Field()
  periodEnd: Date

  // Overall metrics
  @Field(() => Int)
  totalSelections: number

  @Field(() => Int)
  settledSelections: number

  @Field(() => Int)
  pendingSelections: number

  @Field(() => Int)
  won: number

  @Field(() => Int)
  lost: number

  @Field(() => Int)
  voided: number

  // Key metrics
  @Field(() => Float)
  hitRate: number

  @Field(() => Float)
  avgClv: number

  @Field(() => Float)
  roi: number

  @Field(() => Float)
  totalProfitLoss: number

  @Field(() => Float)
  totalStaked: number

  // CLV by period
  @Field(() => Float, { nullable: true })
  clv7d?: number

  @Field(() => Float, { nullable: true })
  clv30d?: number

  @Field(() => Float, { nullable: true })
  clvAllTime?: number

  // Breakdowns
  @Field(() => [FhgLeagueMetricsDto])
  byLeague: FhgLeagueMetricsDto[]

  @Field(() => [FhgSignalMetricsDto])
  bySignal: FhgSignalMetricsDto[]

  // Alerts
  @Field(() => [FhgAlertDto])
  alerts: FhgAlertDto[]
}
