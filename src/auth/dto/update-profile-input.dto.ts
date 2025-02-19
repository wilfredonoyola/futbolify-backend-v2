/** @format */

import { InputType, Field } from "@nestjs/graphql";
import {
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsDateString,
  IsPhoneNumber,
} from "class-validator";

@InputType()
export class UpdateProfileInputDto {
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
