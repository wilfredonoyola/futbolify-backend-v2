import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql'

@ObjectType()
export class FhgFactorDto {
  @Field()
  name: string

  @Field(() => Float)
  value: number

  @Field()
  reason: string
}

@ObjectType()
export class FhgEdgeBreakdownDto {
  @Field(() => Int, { nullable: true })
  dataQualityScore?: number

  @Field(() => Int, { nullable: true })
  patternScore?: number

  @Field(() => Int, { nullable: true })
  contextScore?: number

  @Field(() => Int, { nullable: true })
  valueScore?: number
}

@ObjectType()
export class FhgPredictionDetailDto {
  @Field(() => ID)
  id: string

  @Field(() => ID)
  matchId: string

  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field()
  leagueCode: string

  @Field()
  date: Date

  // Base probability components
  @Field(() => Float)
  pBase: number

  @Field(() => Float)
  leagueAvgG1H: number

  @Field(() => Float)
  homeG1HRate: number

  @Field(() => Float)
  awayConcedeG1HRate: number

  // Final probability
  @Field(() => Float)
  pReal: number

  // Factors
  @Field(() => [FhgFactorDto])
  factors: FhgFactorDto[]

  @Field(() => Float, { nullable: true })
  leagueFactor?: number

  @Field(() => Float, { nullable: true })
  momentumFactor?: number

  @Field(() => Float, { nullable: true })
  aggressionFactor?: number

  @Field(() => Float, { nullable: true })
  vulnerabilityFactor?: number

  @Field(() => Float, { nullable: true })
  contextFactor?: number

  @Field(() => Float, { nullable: true })
  formFactor?: number

  @Field(() => Float, { nullable: true })
  totalFactorMultiplier?: number

  // Edge score
  @Field(() => Int)
  edgeScore: number

  @Field(() => FhgEdgeBreakdownDto, { nullable: true })
  edgeBreakdown?: FhgEdgeBreakdownDto

  @Field({ nullable: true })
  confidenceLevel?: string

  @Field(() => [String])
  warnings: string[]

  @Field()
  createdAt: Date
}
