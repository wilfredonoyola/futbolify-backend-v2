import { InputType, Field, Int } from '@nestjs/graphql'
import { MatchStatusEnum } from '../enums/match-status.enum'

@InputType()
export class AddMatchInputDto {
  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field(() => Int)
  scoreHome: number

  @Field(() => Int)
  scoreAway: number

  @Field(() => MatchStatusEnum)
  status: MatchStatusEnum

  @Field(() => Int, { nullable: true })
  minute?: number

  @Field(() => Int, { nullable: true })
  shots?: number

  @Field(() => Int, { nullable: true })
  shotsOnTarget?: number

  @Field(() => Int, { nullable: true })
  dangerousAttacks?: number

  @Field(() => Int, { nullable: true })
  corners?: number
}
