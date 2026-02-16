import { ObjectType, Field, ID, Float } from '@nestjs/graphql'
import { FhgTier } from '../enums/fhg-tier.enum'

@ObjectType()
export class FhgLeagueDto {
  @Field(() => ID)
  id: string

  @Field()
  code: string

  @Field()
  name: string

  @Field(() => FhgTier)
  tier: FhgTier

  @Field(() => Float)
  avgG1H: number

  @Field({ nullable: true })
  apiFootballId?: number

  @Field({ nullable: true })
  footballDataCode?: string

  @Field()
  active: boolean

  @Field({ nullable: true })
  flag?: string

  @Field(() => Float, { nullable: true })
  g1hRateHome?: number

  @Field(() => Float, { nullable: true })
  g1hRateAway?: number

  @Field(() => Float, { nullable: true })
  avgMinuteFirstGoal?: number

  @Field({ nullable: true })
  lastStatsUpdate?: Date
}
