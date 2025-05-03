import { ObjectType, Field, Int, Float } from '@nestjs/graphql'

@ObjectType()
export class LiveMatchPublicViewDto {
  @Field(() => Int)
  matchId: number

  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field(() => Int)
  minute: number

  @Field(() => Int)
  scoreHome: number

  @Field(() => Int)
  scoreAway: number

  @Field(() => Float, { nullable: true })
  pressureScore?: number

  @Field(() => Float, { nullable: true })
  recentActivityScore?: number

  @Field(() => Float, { nullable: true })
  finalProbability?: number

  @Field({ nullable: true })
  historicalComment?: string

  @Field({ nullable: true })
  reasoning?: string

  @Field()
  state: 'caliente' | 'activo' | 'pasivo'

  @Field()
  decision: 'apostar' | 'observar' | 'retirarse'

  @Field(() => Boolean)
  hasRecentActivity: boolean

  @Field(() => Boolean)
  isLateMatch: boolean

  @Field(() => [String], { nullable: true })
  lastEventTypes?: string[]

  @Field(() => Date)
  lastUpdate: Date
}
