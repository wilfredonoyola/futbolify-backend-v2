import { InputType, Field, ID, Int } from '@nestjs/graphql';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateTemplateInput {
  @Field(() => ID, { nullable: true })
  @IsString()
  @IsOptional()
  brandId?: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  name: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  category: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  thumbnail?: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  width: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  height: number;

  @Field()
  @IsString()
  @IsNotEmpty()
  backgroundColor: string;

  @Field(() => GraphQLJSON)
  templateData: Record<string, any>;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  tags?: string[];

  @Field({ nullable: true, defaultValue: false })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  presetId?: string;
}
