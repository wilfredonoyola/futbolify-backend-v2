import { ObjectType, Field, Int } from '@nestjs/graphql'

@ObjectType()
export class TopScorerDto {
  @Field(() => Int)
  rank: number

  @Field(() => Int)
  playerId: number

  @Field()
  playerName: string

  @Field(() => String, { nullable: true })
  playerPhoto?: string

  @Field(() => String, { nullable: true })
  nationality?: string

  @Field()
  teamName: string

  @Field(() => String, { nullable: true })
  teamLogo?: string

  @Field(() => Int)
  teamId: number

  @Field(() => Int)
  goals: number

  @Field(() => Int)
  assists: number

  @Field(() => Int)
  appearances: number
}
