import { InputType, Field } from '@nestjs/graphql';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { MediaType, MediaCategory } from '../schemas/media.schema';

@InputType()
export class MediaFiltersInput {
  @Field(() => MediaType, { nullable: true })
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType;

  @Field(() => MediaCategory, { nullable: true })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isHighlight?: boolean;
}

