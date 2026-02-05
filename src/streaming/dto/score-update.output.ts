import { Field, ObjectType, ID, Int } from '@nestjs/graphql'

@ObjectType()
export class ScoreUpdate {
  @Field(() => ID)
  streamId: string

  @Field(() => Int)
  homeScore: number

  @Field(() => Int)
  awayScore: number

  @Field({ nullable: true })
  homeTeam?: string

  @Field({ nullable: true })
  awayTeam?: string
}
