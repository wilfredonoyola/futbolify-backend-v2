/** @format */

import { InputType, Field } from "@nestjs/graphql";
import { Prop } from "@nestjs/mongoose";
import { IsOptional } from "class-validator";

@InputType()
export class UpdateProfileInputDto {
  @Prop({ required: true, unique: true })
  @Field()
  userName: string;

  @Field(() => Date)
  birthday: Date;

  @Field({ nullable: true })
  @IsOptional()
  phone: string;

  @Field()
  password: string;

  @Field()
  idToken: string;
}
