/** @format */

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class ConfirmSignupInputDto {
  @Field()
  verificationCode: string;
  @Field()
  password: string;
  @Field()
  email: string;
}
