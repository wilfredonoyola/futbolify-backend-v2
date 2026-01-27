import { InputType, Field, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';
import { PageType } from './content-suggestion.output';

@InputType()
export class FetchContentInput {
  @Field({ nullable: true, defaultValue: 'single-team' })
  @IsString()
  @IsOptional()
  pageType?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  teamId?: string;

  @Field(() => [String], { nullable: true })
  @IsArray()
  @IsOptional()
  teamIds?: string[];

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  leagueId?: string;

  @Field(() => [String], { nullable: true, defaultValue: ['es', 'en'] })
  @IsArray()
  @IsOptional()
  sourceLanguages?: string[];

  @Field(() => Int, { nullable: true, defaultValue: 25 })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  brandId?: string;
}
