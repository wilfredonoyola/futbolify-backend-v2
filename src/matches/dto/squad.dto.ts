import { ObjectType, Field, Int } from '@nestjs/graphql'

@ObjectType()
export class SquadPlayerDto {
  @Field(() => Int)
  id: number

  @Field()
  name: string

  @Field(() => String, { nullable: true })
  photo?: string

  @Field(() => String, { nullable: true })
  position?: string

  @Field(() => Int, { nullable: true })
  number?: number

  @Field(() => Int, { nullable: true })
  age?: number
}

@ObjectType()
export class TeamSquadDto {
  @Field(() => Int)
  teamId: number

  @Field()
  teamName: string

  @Field(() => String, { nullable: true })
  teamLogo?: string

  @Field(() => [SquadPlayerDto])
  players: SquadPlayerDto[]
}
