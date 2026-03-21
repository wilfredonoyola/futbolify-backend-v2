import { InputType, Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  MaxLength,
  IsUrl,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  UserPostContentType,
  SharedMatchData,
  SharedQuinielaData,
  SharedPredictionData,
  SharedRankData,
  PostAuthor,
  OverlayPosition,
} from '../schemas/user-post.schema';

// ============================================================================
// INPUT TYPES
// ============================================================================

@InputType()
export class SharedMatchInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  matchId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  homeTeam: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  awayTeam: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  homeTeamLogo?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  awayTeamLogo?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  scoreHome?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  scoreAway?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  leagueName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  leagueLogo?: string;

  @Field({ nullable: true })
  @IsOptional()
  kickoffTime?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isLive?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isFinished?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  round?: string;
}

@InputType()
export class SharedQuinielaInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsString()
  quinielaId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  name: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  code: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  leagueId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  ownerName: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  memberCount?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

@InputType()
export class SharedPredictionInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsString()
  predictionId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  matchId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  homeTeam: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  awayTeam: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  homeTeamLogo?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  awayTeamLogo?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  predictedHome?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  predictedAway?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  predictedWinner?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  actualHome?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  actualAway?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isExactScore?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  pointsEarned?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  quinielaId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  quinielaName?: string;

  @Field({ nullable: true })
  @IsOptional()
  kickoffTime?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isFinished?: boolean;
}

@InputType()
export class OverlayPositionInput {
  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  x?: number; // 0-1 (percentage from left)

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  y?: number; // 0-1 (percentage from top)

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  scale?: number; // Scale multiplier

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  rotation?: number; // Degrees
}

@InputType()
export class SharedRankInput {
  @Field(() => ID)
  @IsNotEmpty()
  @IsString()
  quinielaId: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  quinielaName: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  quinielaImage?: string;

  @Field(() => Int)
  @IsNotEmpty()
  currentRank: number;

  @Field(() => Int)
  @IsNotEmpty()
  totalMembers: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  totalPoints?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  previousRank?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  leagueName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  leagueLogo?: string;
}

@InputType()
export class CreateUserPostInput {
  @Field(() => UserPostContentType)
  @IsEnum(UserPostContentType)
  contentType: UserPostContentType;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // For image posts
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  imageUrls?: string[];

  // For video posts
  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  // For match shares
  @Field(() => SharedMatchInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SharedMatchInput)
  sharedMatch?: SharedMatchInput;

  // For quiniela shares
  @Field(() => SharedQuinielaInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SharedQuinielaInput)
  sharedQuiniela?: SharedQuinielaInput;

  // For prediction shares
  @Field(() => SharedPredictionInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SharedPredictionInput)
  sharedPrediction?: SharedPredictionInput;

  // For rank shares
  @Field(() => SharedRankInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => SharedRankInput)
  sharedRank?: SharedRankInput;

  // Overlay position (for canvas-based positioning)
  @Field(() => OverlayPositionInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => OverlayPositionInput)
  overlayPosition?: OverlayPositionInput;
}

@InputType()
export class UpdateUserPostInput {
  @Field(() => ID)
  @IsNotEmpty()
  postId: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

@InputType()
export class FeedFilterInput {
  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  limit?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  offset?: number;

  @Field(() => UserPostContentType, { nullable: true })
  @IsOptional()
  @IsEnum(UserPostContentType)
  contentType?: UserPostContentType;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  userId?: string;

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  includeContextualCards?: boolean;

  @Field(() => Int, { nullable: true, defaultValue: 5 })
  @IsOptional()
  cardInterval?: number;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

@ObjectType()
export class UserPostOutput {
  @Field(() => ID)
  id: string;

  @Field(() => PostAuthor)
  author: PostAuthor;

  @Field(() => UserPostContentType)
  contentType: UserPostContentType;

  @Field()
  description: string;

  @Field(() => [String], { nullable: true })
  imageUrls?: string[];

  @Field({ nullable: true })
  videoUrl?: string;

  @Field({ nullable: true })
  thumbnailUrl?: string;

  @Field(() => SharedMatchData, { nullable: true })
  sharedMatch?: SharedMatchData;

  @Field(() => SharedQuinielaData, { nullable: true })
  sharedQuiniela?: SharedQuinielaData;

  @Field(() => SharedPredictionData, { nullable: true })
  sharedPrediction?: SharedPredictionData;

  @Field(() => SharedRankData, { nullable: true })
  sharedRank?: SharedRankData;

  @Field(() => OverlayPosition, { nullable: true })
  overlayPosition?: OverlayPosition;

  @Field(() => Int)
  likesCount: number;

  @Field(() => Int)
  commentsCount: number;

  @Field(() => Int)
  sharesCount: number;

  @Field(() => Int)
  viewsCount: number;

  @Field()
  isLikedByMe: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class DeletePostResult {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  message?: string;
}

@ObjectType()
export class LikePostResult {
  @Field()
  success: boolean;

  @Field()
  isLiked: boolean;

  @Field(() => Int)
  likesCount: number;
}
