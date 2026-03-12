// Platform Link Schema - Links users to external platforms (Telegram, Slack, etc.)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum Platform {
  TELEGRAM = 'telegram',
  SLACK = 'slack',
  DISCORD = 'discord',
  GCHAT = 'gchat',
  TEAMS = 'teams',
}

registerEnumType(Platform, {
  name: 'Platform',
  description: 'External platforms that can be linked to a user',
});

@Schema({ timestamps: true, collection: 'platform_links' })
@ObjectType()
export class PlatformLink {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  @Field(() => ID)
  userId: Types.ObjectId;

  @Prop({ required: true, enum: Platform })
  @Field(() => Platform)
  platform: Platform;

  @Prop({ required: true })
  @Field()
  platformUserId: string; // Telegram chatId, Slack userId, etc.

  @Prop()
  @Field({ nullable: true })
  platformUsername?: string; // @username in Telegram, display name in Slack

  @Prop()
  @Field({ nullable: true })
  platformGroupId?: string; // Group/channel where user interacted

  @Prop({ default: true })
  @Field()
  isActive: boolean;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}

export type PlatformLinkDocument = PlatformLink & Document;

export const PlatformLinkSchema = SchemaFactory.createForClass(PlatformLink);

// Indexes
PlatformLinkSchema.index({ platform: 1, platformUserId: 1 }, { unique: true });
PlatformLinkSchema.index({ userId: 1 });
PlatformLinkSchema.index({ platform: 1, platformGroupId: 1 });
