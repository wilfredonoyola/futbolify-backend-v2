import { ObjectType, Field, Float, Int, ID } from '@nestjs/graphql'
import { RiskLevel } from '../enums/risk-level.enum'
import { PickResult } from '../schemas/goal-guru-pick.schema'

@ObjectType()
export class GoalGuruPickDto {
  @Field(() => ID)
  id: string

  @Field(() => ID)
  userId: string

  @Field(() => ID, { nullable: true })
  sessionId?: string

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

  @Field(() => PickResult)
  result: PickResult

  @Field(() => Float)
  profit: number

  @Field()
  league: string

  @Field({ nullable: true })
  resolvedAt?: Date

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}
