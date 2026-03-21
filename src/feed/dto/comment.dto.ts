import { InputType, Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { CommentAuthor } from '../schemas/comment.schema';

// ============================================================================
// INPUT TYPES
// ============================================================================

@InputType()
export class CreateCommentInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsString()
  postId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  content: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  parentCommentId?: string;
}

@InputType()
export class UpdateCommentInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsString()
  commentId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  content: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

@ObjectType()
export class CommentOutput {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  postId: string;

  @Field(() => CommentAuthor)
  author: CommentAuthor;

  @Field()
  content: string;

  @Field(() => ID, { nullable: true })
  parentCommentId?: string;

  @Field(() => Int)
  likesCount: number;

  @Field(() => Int)
  repliesCount: number;

  @Field(() => Int)
  depth: number;

  @Field()
  isDeleted: boolean;

  @Field()
  isLikedByMe: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  // Optional: nested replies (only for first level)
  @Field(() => [CommentOutput], { nullable: true })
  replies?: CommentOutput[];
}

@ObjectType()
export class CommentsResponse {
  @Field(() => [CommentOutput])
  comments: CommentOutput[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}

@ObjectType()
export class DeleteCommentResult {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  message?: string;
}

@ObjectType()
export class LikeCommentResult {
  @Field()
  success: boolean;

  @Field()
  isLiked: boolean;

  @Field(() => Int)
  likesCount: number;
}

// ============================================================================
// VIEWS & SHARES OUTPUT TYPES
// ============================================================================

@ObjectType()
export class RecordViewResult {
  @Field()
  success: boolean;

  @Field(() => Int)
  viewsCount: number;
}

@ObjectType()
export class SharePostResult {
  @Field()
  success: boolean;

  @Field(() => Int)
  sharesCount: number;
}
