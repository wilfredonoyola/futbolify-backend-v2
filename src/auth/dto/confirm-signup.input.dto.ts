/** @format */

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class ConfirmSignupInputDto {
  @Field()
  verificationCode: string;

  @Field()
  password: string;

  @Field()
  phone: number;

  @Field()
  userName: string;

  @Field(() => Date)
  birthday: Date;

  @Field()
  email: string;
}
