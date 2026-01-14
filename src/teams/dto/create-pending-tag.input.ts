import { InputType, Field, ID } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsPhoneNumber } from 'class-validator';

@InputType()
export class CreatePendingTagInput {
  @Field(() => ID)
  @IsNotEmpty()
  mediaId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  phone?: string;
}
