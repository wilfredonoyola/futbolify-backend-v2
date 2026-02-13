import { ObjectType, Field } from '@nestjs/graphql'

@ObjectType()
export class GoalGuruMatchDto {
  @Field()
  home: string

  @Field()
  away: string

  @Field()
  date: string

  @Field()
  time: string

  @Field()
  comp: string
}
