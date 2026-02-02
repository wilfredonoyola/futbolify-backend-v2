import { InputType, Field, ID, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, Min, Max, IsInt } from 'class-validator';
import { PostStatus } from '../schemas/post.schema';

@InputType()
export class GeneratePostInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  suggestionId: string;

  @Field(() => ID)
  @IsNotEmpty()
  brandId: string;
}

@InputType()
export class UpdatePostContentInput {
  @Field(() => ID)
  @IsNotEmpty()
  postId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  finalText: string;
}

@InputType()
export class SubmitFeedbackInput {
  @Field(() => ID)
  @IsNotEmpty()
  postId: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}

@InputType()
export class RejectPostInput {
  @Field(() => ID)
  @IsNotEmpty()
  postId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}

@InputType()
export class PostFilterInput {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  brandId?: string;

  @Field(() => PostStatus, { nullable: true })
  @IsOptional()
  status?: PostStatus;

  @Field(() => Int, { nullable: true, defaultValue: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}
