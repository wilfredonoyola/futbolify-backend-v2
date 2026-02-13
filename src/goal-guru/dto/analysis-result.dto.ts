import { ObjectType, Field, Float, Int } from '@nestjs/graphql'
import { RiskLevel } from '../enums/risk-level.enum'

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
  capas: string

  @Field()
  c1: string

  @Field()
  c2: string

  @Field()
  maestro: string

  @Field()
  score: string

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

  @Field()
  top: string

  @Field({ nullable: true })
  parlay?: string

  @Field()
  bank: string
}
