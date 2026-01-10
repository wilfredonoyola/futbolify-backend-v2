import { InputType, Field, Float } from '@nestjs/graphql';
import { IsOptional, IsEnum, IsBoolean, IsNumber } from 'class-validator';
import { MediaCategory } from '../schemas/media.schema';

@InputType()
export class UpdateMediaInput {
  @Field({ nullable: true })
  @IsOptional()
  thumbnailUrl?: string;

  @Field(() => MediaCategory, { nullable: true })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isHighlight?: boolean;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  duration?: number;
}

