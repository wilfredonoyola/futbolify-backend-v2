import { ObjectType, Field, Float, Int } from '@nestjs/graphql'
import { RiskLevel } from '../enums/risk-level.enum'

/**
 * G1H Stats for a pick - expert-level statistics
 * Based on research from FootyStats, Performance Odds, The Stat Bible
 */
@ObjectType()
export class G1HStatsDto {
  /** % of home team's matches with goal in 1H */
  @Field(() => Int, { nullable: true })
  homeG1HPercent?: number

  /** % of away team's matches where they concede in 1H */
  @Field(() => Int, { nullable: true })
  awayConcedeG1HPercent?: number

  /** Average minute of first goal in this matchup */
  @Field(() => Int, { nullable: true })
  avgMinuteFirstGoal?: number

  /** Home team's 1H goals average */
  @Field(() => Float, { nullable: true })
  homeAvg1HGoals?: number

  /** FHPI Score (First Half Performance Index) */
  @Field(() => Float, { nullable: true })
  fhpiScore?: number
}

@ObjectType()
export class PickDetailDto {
  @Field()
  match: string

  @Field()
  mercado: string

  @Field(() => Float)
  odds: number

  @Field(() => Int)
  confianza: number

  @Field(() => Int)
  stake: number

  @Field(() => RiskLevel)
  riesgo: RiskLevel

  @Field()
  razon: string

  @Field({ nullable: true })
  patron?: string

  /** G1H-specific statistics for this pick */
  @Field(() => G1HStatsDto, { nullable: true })
  g1hStats?: G1HStatsDto

  // Legacy fields (optional for backward compatibility)
  @Field({ nullable: true })
  capas?: string

  @Field({ nullable: true })
  c1?: string

  @Field({ nullable: true })
  c2?: string

  @Field({ nullable: true })
  maestro?: string

  @Field({ nullable: true })
  score?: string

  @Field({ nullable: true })
  alt?: string

  @Field({ nullable: true })
  alerta?: string
}

@ObjectType()
export class SkipDetailDto {
  @Field()
  match: string

  @Field()
  razon: string
}

@ObjectType()
export class AnalysisResultDto {
  @Field(() => [PickDetailDto])
  picks: PickDetailDto[]

  @Field(() => [SkipDetailDto])
  skip: SkipDetailDto[]

  @Field({ nullable: true })
  mejorPick?: string

  @Field({ nullable: true })
  alertas?: string

  // Legacy fields (optional for backward compatibility)
  @Field({ nullable: true })
  top?: string

  @Field({ nullable: true })
  parlay?: string

  @Field({ nullable: true })
  bank?: string
}
