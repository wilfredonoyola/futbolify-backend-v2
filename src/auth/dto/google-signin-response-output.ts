/** @format */

import { ObjectType, Field } from '@nestjs/graphql'
import { UserRole } from 'src/users/schemas/user.schema'

@ObjectType()
export class GoogleSigninResponse {
  @Field()
  id: string

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

  @Field()
  access_token: string

  @Field(() => [UserRole])
  roles: UserRole[]
}
