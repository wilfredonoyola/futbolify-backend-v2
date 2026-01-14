import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  TAG = 'TAG',                    // Someone tagged you in media
  TEAM_JOIN = 'TEAM_JOIN',        // Someone joined your team
  INVITE_ACCEPTED = 'INVITE_ACCEPTED', // Your invite was accepted
  NEW_MEDIA = 'NEW_MEDIA',        // New media in your team
  MENTION = 'MENTION',            // Someone mentioned you
}

registerEnumType(NotificationType, {
  name: 'NotificationType',
  description: 'Type of notification',
});

@Schema({ timestamps: true })
@ObjectType()
export class Notification extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  @Field(() => ID)
  userId: Types.ObjectId; // Who receives the notification

  @Prop({ type: String, enum: NotificationType, required: true })
  @Field(() => NotificationType)
  type: NotificationType;

  @Prop({ required: true })
  @Field()
  title: string;

  @Prop({ required: true })
  @Field()
  message: string;

  @Prop({ required: false })
  @Field({ nullable: true })
  imageUrl?: string; // Thumbnail or avatar

  @Prop({ required: false })
  @Field({ nullable: true })
  actionUrl?: string; // Where to navigate when clicked

  @Prop({ default: false })
  @Field()
  isRead: boolean;

  @Prop({ default: false })
  @Field()
  emailSent: boolean;

  // Related entities (for context)
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  @Field(() => ID, { nullable: true })
  actorId?: Types.ObjectId; // Who triggered the notification

  @Prop({ type: Types.ObjectId, ref: 'Media', required: false })
  @Field(() => ID, { nullable: true })
  mediaId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Team', required: false })
  @Field(() => ID, { nullable: true })
  teamId?: Types.ObjectId;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Indexes for efficient queries
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });
