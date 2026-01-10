import { InputType, Field, ID } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsMongoId } from 'class-validator';

@InputType()
export class CreateMatchInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsMongoId()
  teamId: string;

  @Field()
  @IsNotEmpty()
  date: Date;

  @Field({ nullable: true })
  @IsOptional()
  opponent?: string;

  @Field({ nullable: true })
  @IsOptional()
  location?: string;
}

