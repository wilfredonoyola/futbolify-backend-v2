import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Field, ObjectType, ID, Int, registerEnumType } from '@nestjs/graphql';
import { ContentType, ContentPriority } from '../dto/content-suggestion.output';

export enum PostStatus {
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  READY = 'READY',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
}

export enum PostOrigin {
  REACTIVE = 'REACTIVE',
  PROACTIVE = 'PROACTIVE',
}

registerEnumType(PostStatus, { name: 'PostStatus' });
registerEnumType(PostOrigin, { name: 'PostOrigin' });

@ObjectType()
export class SourceContent {
  @Field()
  @Prop({ required: true })
  title: string;

  @Field()
  @Prop({ required: true })
  description: string;

  @Field()
  @Prop({ required: true })
  sourceUrl: string;

  @Field()
  @Prop({ required: true })
  sourceName: string;

  @Field({ nullable: true })
  @Prop()
  imageUrl?: string;
}

@ObjectType()
export class GenerationMetadata {
  @Field()
  @Prop({ required: true })
  model: string;

  @Field()
  @Prop({ required: true })
  promptVersion: string;

  @Field(() => Int)
  @Prop({ required: true })
  tokensUsed: number;

  @Field()
  @Prop({ required: true })
  generatedAt: Date;
}

@ObjectType()
export class PostFeedback {
  @Field(() => Int)
  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Field({ nullable: true })
  @Prop()
  notes?: string;
}

@Schema({ timestamps: true })
@ObjectType()
export class Post extends Document {
  @Field(() => ID)
  id: string;

  @Field(() => PostOrigin)
  @Prop({ type: String, enum: PostOrigin, required: true })
  origin: PostOrigin;

  @Field(() => ID)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Brand', required: true })
  brandId: MongooseSchema.Types.ObjectId;

  @Field({ nullable: true })
  @Prop()
  contentSuggestionId?: string;

  @Field(() => ContentType)
  @Prop({ type: String, enum: ContentType, required: true })
  contentType: ContentType;

  @Field(() => ContentPriority)
  @Prop({ type: String, enum: ContentPriority, required: true })
  priority: ContentPriority;

  @Field(() => SourceContent)
  @Prop({ type: SourceContent, required: true })
  sourceContent: SourceContent;

  @Field()
  @Prop({ required: true })
  generatedText: string;

  @Field({ nullable: true })
  @Prop()
  finalText?: string;

  @Field(() => GenerationMetadata)
  @Prop({ type: GenerationMetadata, required: true })
  generation: GenerationMetadata;

  @Field(() => PostStatus)
  @Prop({ type: String, enum: PostStatus, default: PostStatus.PENDING })
  status: PostStatus;

  @Field(() => ID, { nullable: true })
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  claimedBy?: MongooseSchema.Types.ObjectId;

  @Field({ nullable: true })
  @Prop()
  claimedAt?: Date;

  @Field({ nullable: true })
  @Prop()
  rejectionReason?: string;

  @Field(() => PostFeedback, { nullable: true })
  @Prop({ type: PostFeedback })
  feedback?: PostFeedback;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Indexes
PostSchema.index({ brandId: 1 });
PostSchema.index({ brandId: 1, status: 1 });
PostSchema.index({ claimedBy: 1 });
PostSchema.index({ status: 1 });
PostSchema.index({ contentSuggestionId: 1 });
PostSchema.index({ createdAt: -1 });
