import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql';

export type WatermarkStyle = 'logo-only' | 'text-only' | 'logo-text' | 'text-logo' | 'none';
export type WatermarkPosition = 'bottom-left' | 'bottom-center' | 'bottom-right' | 'top-left' | 'top-center' | 'top-right';
export type WatermarkSize = 'small' | 'medium' | 'large';

@ObjectType()
export class ThemeTokens {
  @Field()
  @Prop({ required: true })
  primaryColor: string;

  @Field()
  @Prop({ required: true })
  secondaryColor: string;

  @Field()
  @Prop({ required: true })
  accentColor: string;

  @Field()
  @Prop({ required: true })
  backgroundColor: string;

  @Field()
  @Prop({ required: true })
  textColor: string;

  @Field()
  @Prop({ required: true })
  logo: string;

  @Field()
  @Prop({ required: true })
  fontPrimary: string;

  @Field()
  @Prop({ required: true })
  fontSecondary: string;

  @Field()
  @Prop({ required: true })
  fanPageName: string;
}

@ObjectType()
export class WatermarkConfig {
  @Field()
  @Prop({ required: true })
  style: WatermarkStyle;

  @Field()
  @Prop({ required: true })
  position: WatermarkPosition;

  @Field({ nullable: true })
  @Prop()
  customText?: string;

  @Field()
  @Prop({ required: true })
  showBackground: boolean;

  @Field({ nullable: true })
  @Prop()
  backgroundColor?: string;

  @Field()
  @Prop({ required: true })
  size: WatermarkSize;
}

@ObjectType()
export class ContentPreferences {
  @Field({ nullable: true })
  @Prop()
  teamId?: string;

  @Field({ nullable: true })
  @Prop()
  leagueId?: string;

  @Field(() => [String], { nullable: true })
  @Prop({ type: [String] })
  additionalTeams?: string[];

  @Field(() => [String])
  @Prop({ type: [String], required: true })
  contentTypes: string[];

  @Field()
  @Prop({ required: true })
  publishLanguage: string;

  @Field(() => [String])
  @Prop({ type: [String], required: true })
  sourceLanguages: string[];

  @Field()
  @Prop({ required: true })
  notifyBreaking: boolean;

  @Field()
  @Prop({ required: true })
  notifyMatchday: boolean;
}

@Schema({ timestamps: true })
@ObjectType()
export class Brand extends Document {
  @Field(() => ID)
  _id: MongooseSchema.Types.ObjectId;

  @Field(() => ID)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Field()
  @Prop({ required: true })
  fanPageId: string;

  @Field()
  @Prop({ required: true })
  fanPageName: string;

  @Field(() => ThemeTokens)
  @Prop({ type: ThemeTokens, required: true })
  tokens: ThemeTokens;

  @Field(() => WatermarkConfig)
  @Prop({ type: WatermarkConfig, required: true })
  watermark: WatermarkConfig;

  @Field(() => ContentPreferences, { nullable: true })
  @Prop({ type: ContentPreferences })
  contentPreferences?: ContentPreferences;

  @Field()
  @Prop({ default: false })
  isActive: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export const BrandSchema = SchemaFactory.createForClass(Brand);

// Indexes
BrandSchema.index({ userId: 1 });
BrandSchema.index({ userId: 1, isActive: 1 });
