import { ObjectType, Field, Int } from '@nestjs/graphql'
import { MatchStatusEnum } from '../enums/match-status.enum'
import { registerEnumType } from '@nestjs/graphql'

registerEnumType(MatchStatusEnum, {
  name: 'MatchStatus',
})

@ObjectType()
export class MatchOutputDto {
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

  @Field(() => MatchStatusEnum)
  status: MatchStatusEnum
}
