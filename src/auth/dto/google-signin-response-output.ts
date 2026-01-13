/** @format */

import { ObjectType, Field } from '@nestjs/graphql'

@ObjectType()
export class GoogleSigninResponse {
  @Field()
  email: string

  @Field()
  userName: string

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  avatarUrl: string

  @Field()
  isProfileCompleted: boolean
}
