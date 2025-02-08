/** @format */

import { ObjectType, Field } from "@nestjs/graphql";

@ObjectType()
export class GoogleSigninResponse {
  @Field()
  email: string;

  @Field()
  userName: string;

  @Field()
  avatar: string;

  @Field()
  isProfileCompleted: boolean;
}
