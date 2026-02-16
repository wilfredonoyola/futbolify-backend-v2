import { ObjectType, Field, Int, InputType } from '@nestjs/graphql'
import { FhgSelectionDto } from './fhg-selection.dto'

@ObjectType()
export class DailyPipelineResultDto {
  @Field()
  pipelineId: string

  @Field()
  date: Date

  @Field(() => Int)
  matchesAnalyzed: number

  @Field(() => Int)
  candidatesFound: number

  @Field(() => Int)
  selectionsCreated: number

  @Field(() => [FhgSelectionDto])
  selections: FhgSelectionDto[]

  @Field(() => [String])
  skippedReasons: string[]

  @Field(() => Int)
  executionTimeMs: number

  @Field()
  success: boolean

  @Field({ nullable: true })
  error?: string
}

@ObjectType()
export class SettlementResultDto {
  @Field(() => Int)
  settled: number

  @Field(() => Int)
  won: number

  @Field(() => Int)
  lost: number

  @Field(() => Int)
  voided: number

  @Field(() => [FhgSelectionDto])
  settledSelections: FhgSelectionDto[]

  @Field()
  success: boolean

  @Field({ nullable: true })
  error?: string
}

@ObjectType()
export class RefreshResultDto {
  @Field(() => Int)
  updated: number

  @Field(() => Int)
  created: number

  @Field(() => Int)
  failed: number

  @Field()
  success: boolean

  @Field({ nullable: true })
  error?: string
}

@ObjectType()
export class FhgMatchCandidateDto {
  @Field()
  matchId: string

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

  @Field({ nullable: true })
  pReal?: number

  @Field({ nullable: true })
  edgeScore?: number

  @Field({ nullable: true })
  bestOdds?: number

  @Field({ nullable: true })
  marginValor?: number

  @Field({ nullable: true })
  signal?: string

  @Field()
  hasOdds: boolean

  @Field()
  hasPrediction: boolean
}

@InputType()
export class FhgPipelineOptionsInput {
  @Field({ nullable: true })
  date?: string // YYYY-MM-DD format, defaults to today

  @Field({ nullable: true })
  leagueCode?: string // Filter to specific league

  @Field({ nullable: true })
  dryRun?: boolean // If true, don't persist selections

  @Field({ nullable: true })
  forceRegenerate?: boolean // If true, delete existing predictions and regenerate
}
