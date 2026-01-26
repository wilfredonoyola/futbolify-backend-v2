import { InputType, Field, ID, Int } from '@nestjs/graphql';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class UpdateTemplateInput {
  @Field(() => ID)
  @IsString()
  @IsNotEmpty()
  id: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  name?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  category?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  thumbnail?: string;

  @Field(() => Int, { nullable: true })
  @IsInt()
  @Min(1)
  @IsOptional()
  width?: number;

  @Field(() => Int, { nullable: true })
  @IsInt()
  @Min(1)
  @IsOptional()
  height?: number;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  backgroundColor?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  templateData?: Record<string, any>;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  tags?: string[];

  @Field({ nullable: true })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
