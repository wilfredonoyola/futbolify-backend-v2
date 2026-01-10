import { Field, ObjectType, ID, Int, Float, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MediaDocument = Media & Document;

export enum MediaType {
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
}

export enum MediaCategory {
  GOAL = 'GOAL',
  PLAY = 'PLAY',
  FAIL = 'FAIL',
}

registerEnumType(MediaType, {
  name: 'MediaType',
  description: 'Type of media content',
});

registerEnumType(MediaCategory, {
  name: 'MediaCategory',
  description: 'Category of media content',
});

@Schema({ timestamps: true })
@ObjectType()
export class Media extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TeamMatch', required: true })
  @Field(() => ID)
  matchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  uploadedBy: Types.ObjectId;

  @Prop({ type: String, enum: MediaType, required: true })
  @Field(() => MediaType)
  type: MediaType;

  @Prop({ required: true })
  @Field()
  url: string;

  @Prop({ required: false })
  @Field({ nullable: true })
  thumbnailUrl?: string;

  @Prop({ type: String, enum: MediaCategory, required: false })
  @Field(() => MediaCategory, { nullable: true })
  category?: MediaCategory;

  @Prop({ default: false })
  @Field(() => Boolean)
  isHighlight: boolean;

  @Prop({ required: false })
  @Field(() => Float, { nullable: true })
  duration?: number;

  @Prop()
  @Field(() => Date)
  createdAt: Date;

  @Prop()
  @Field(() => Date)
  updatedAt: Date;
}

export const MediaSchema = SchemaFactory.createForClass(Media);

// Indexes for queries
MediaSchema.index({ matchId: 1 });
MediaSchema.index({ uploadedBy: 1 });
MediaSchema.index({ type: 1 });
MediaSchema.index({ category: 1 });
MediaSchema.index({ isHighlight: 1 });

