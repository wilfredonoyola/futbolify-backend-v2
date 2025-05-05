/** @format */

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class SignupInputDto {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  phone: number;

  @Field()
  userName: string;

  @Field(() => Date)
  birthday: Date;
}
