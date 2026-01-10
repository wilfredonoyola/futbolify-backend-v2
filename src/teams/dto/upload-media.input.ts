import { InputType, Field, ID, Float } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsEnum, IsMongoId, IsBoolean, IsNumber } from 'class-validator';
import { MediaType, MediaCategory } from '../schemas/media.schema';

@InputType()
export class UploadMediaInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsMongoId()
  matchId: string;

  @Field(() => MediaType)
  @IsEnum(MediaType)
  type: MediaType;

  @Field()
  @IsNotEmpty()
  url: string;

  @Field({ nullable: true })
  @IsOptional()
  thumbnailUrl?: string;

  @Field(() => MediaCategory, { nullable: true })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  isHighlight?: boolean;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  duration?: number;
}

