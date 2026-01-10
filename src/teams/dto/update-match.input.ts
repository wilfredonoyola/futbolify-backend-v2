import { InputType, Field } from '@nestjs/graphql';
import { IsOptional } from 'class-validator';

@InputType()
export class UpdateMatchInput {
  @Field({ nullable: true })
  @IsOptional()
  date?: Date;

  @Field({ nullable: true })
  @IsOptional()
  opponent?: string;

  @Field({ nullable: true })
  @IsOptional()
  location?: string;
}

