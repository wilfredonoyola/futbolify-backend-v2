import { InputType, Field, ID } from '@nestjs/graphql';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ThemeTokensInput, WatermarkConfigInput, ContentPreferencesInput } from './create-brand.input';

@InputType()
export class UpdateBrandInput {
  @Field(() => ID)
  @IsString()
  @IsNotEmpty()
  id: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  fanPageName?: string;

  @Field(() => ThemeTokensInput, { nullable: true })
  @ValidateNested()
  @Type(() => ThemeTokensInput)
  @IsOptional()
  tokens?: ThemeTokensInput;

  @Field(() => WatermarkConfigInput, { nullable: true })
  @ValidateNested()
  @Type(() => WatermarkConfigInput)
  @IsOptional()
  watermark?: WatermarkConfigInput;

  @Field(() => ContentPreferencesInput, { nullable: true })
  @ValidateNested()
  @Type(() => ContentPreferencesInput)
  @IsOptional()
  contentPreferences?: ContentPreferencesInput;

  @Field({ nullable: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
