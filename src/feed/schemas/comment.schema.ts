import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Field, ObjectType, ID, Int } from '@nestjs/graphql';

// Author info embedded in comments (reuse same structure as PostAuthor)
@ObjectType()
export class CommentAuthor {
  @Field(() => ID)
  @Prop({ required: true })
  userId: string;

  @Field()
  @Prop({ required: true })
  username: string;

  @Field({ nullable: true })
  @Prop()
  displayName?: string;

  @Field({ nullable: true })
  @Prop()
  avatarUrl?: string;

  @Field()
  @Prop({ default: false })
  isVerified: boolean;
}

// Main Comment schema
@Schema({ timestamps: true, collection: 'comments' })
@ObjectType()
export class Comment {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  @Prop({ required: true, index: true })
  postId: string;

  @Field(() => CommentAuthor)
  @Prop({ type: CommentAuthor, required: true })
  author: CommentAuthor;

  @Field()
  @Prop({ required: true, maxlength: 500 })
  content: string;

  // For replies - reference to parent comment
  @Field(() => ID, { nullable: true })
  @Prop({ index: true })
  parentCommentId?: string;

  // Engagement metrics
  @Field(() => Int)
  @Prop({ default: 0 })
  likesCount: number;

  // Users who liked this comment
  @Prop({ type: [String], default: [] })
  likedBy: string[];

  // Replies count (only for root comments)
  @Field(() => Int)
  @Prop({ default: 0 })
  repliesCount: number;

  // Depth level: 0 = root comment, 1 = reply (max depth)
  @Field(() => Int)
  @Prop({ default: 0 })
  depth: number;

  // Soft delete
  @Field()
  @Prop({ default: false })
  isDeleted: boolean;

  @Field({ nullable: true })
  @Prop()
  deletedAt?: Date;

  // Timestamps
  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export type CommentDocument = Comment & Document;
export const CommentSchema = SchemaFactory.createForClass(Comment);

// Indexes for efficient queries
CommentSchema.index({ postId: 1, createdAt: -1 }); // Get comments for a post
CommentSchema.index({ postId: 1, parentCommentId: 1, createdAt: -1 }); // Get root comments
CommentSchema.index({ parentCommentId: 1, createdAt: 1 }); // Get replies for a comment
CommentSchema.index({ 'author.userId': 1, createdAt: -1 }); // Get user's comments
CommentSchema.index({ isDeleted: 1, postId: 1 }); // Filter deleted comments
