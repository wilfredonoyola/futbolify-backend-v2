import { InputType, Field, Float, Int } from '@nestjs/graphql'
import { RiskLevel } from '../enums/risk-level.enum'

@InputType()
export class MarkResultInput {
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
  won: boolean

  @Field()
  league: string

  @Field(() => Int)
  unitValue: number
}
