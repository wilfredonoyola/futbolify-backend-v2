import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class ThemeTokensInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  primaryColor: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  secondaryColor: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  accentColor: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  backgroundColor: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  textColor: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  logo: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  fontPrimary: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  fontSecondary: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  fanPageName: string;
}

@InputType()
export class WatermarkConfigInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  style: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  position: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  customText?: string;

  @Field()
  @IsBoolean()
  showBackground: boolean;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  backgroundColor?: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  size: string;
}

@InputType()
export class ContentPreferencesInput {
  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  teamId?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  leagueId?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  additionalTeams?: string[];

  @Field(() => [String])
  contentTypes: string[];

  @Field()
  @IsString()
  @IsNotEmpty()
  publishLanguage: string;

  @Field(() => [String])
  sourceLanguages: string[];

  @Field()
  @IsBoolean()
  notifyBreaking: boolean;

  @Field()
  @IsBoolean()
  notifyMatchday: boolean;
}

@InputType()
export class CreateBrandInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  fanPageId: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  fanPageName: string;

  @Field(() => ThemeTokensInput)
  @ValidateNested()
  @Type(() => ThemeTokensInput)
  tokens: ThemeTokensInput;

  @Field(() => WatermarkConfigInput)
  @ValidateNested()
  @Type(() => WatermarkConfigInput)
  watermark: WatermarkConfigInput;

  @Field(() => ContentPreferencesInput, { nullable: true })
  @ValidateNested()
  @Type(() => ContentPreferencesInput)
  @IsOptional()
  contentPreferences?: ContentPreferencesInput;

  @Field({ nullable: true, defaultValue: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
