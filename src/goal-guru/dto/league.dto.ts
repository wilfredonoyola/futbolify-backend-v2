import { ObjectType, Field } from '@nestjs/graphql'

@ObjectType()
export class GoalGuruLeagueDto {
  @Field()
  id: string

  @Field()
  name: string

  @Field()
  flag: string

  @Field()
  search: string
}
