import { Field, ObjectType, ID } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MediaTagDocument = MediaTag & Document;

@Schema({ timestamps: false })
@ObjectType()
export class MediaTag extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Media', required: true })
  @Field(() => ID)
  mediaId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  taggedBy: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  @Field(() => Date)
  createdAt: Date;
}

export const MediaTagSchema = SchemaFactory.createForClass(MediaTag);

// Composite unique index to prevent duplicate tags
MediaTagSchema.index({ mediaId: 1, userId: 1 }, { unique: true });
MediaTagSchema.index({ userId: 1 });
MediaTagSchema.index({ mediaId: 1 });

