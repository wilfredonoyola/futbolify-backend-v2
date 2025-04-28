import { ObjectType, Field, Int } from '@nestjs/graphql'

@ObjectType()
export class LiveMatchOutputDto {
  @Field(() => Int)
  id: number

  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field(() => Int, { nullable: true })
  minute?: number

  @Field(() => Int)
  scoreHome: number

  @Field(() => Int)
  scoreAway: number

  @Field(() => Int, { nullable: true })
  shots?: number

  @Field(() => Int, { nullable: true })
  shotsOnTarget?: number

  @Field(() => Int, { nullable: true })
  dangerousAttacks?: number

  @Field(() => Int, { nullable: true })
  corners?: number

  @Field(() => [String], { nullable: true })
  bookmakers?: string[] // 🏦 Casas disponibles

  @Field(() => String, { nullable: true })
  nextGoalOddsHome?: string // ⚽ Cuota próximo gol local

  @Field(() => String, { nullable: true })
  nextGoalOddsAway?: string // ⚽ Cuota próximo gol visitante

  @Field(() => String, { nullable: true })
  initialOddsHome?: string // 🎯 Cuota inicial local

  @Field(() => String, { nullable: true })
  initialOddsAway?: string // 🎯 Cuota inicial visitante

  @Field(() => String, { nullable: true })
  liveOddsHome?: string // 🔥 Cuota live local

  @Field(() => String, { nullable: true })
  liveOddsAway?: string // 🔥 Cuota live visitante
}
