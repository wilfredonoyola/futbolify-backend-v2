import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Field, ObjectType, ID, Int, registerEnumType } from '@nestjs/graphql';

// Content type enum for user posts
export enum UserPostContentType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  MATCH_SHARE = 'matchShare',
  QUINIELA_SHARE = 'quinielaShare',
  PREDICTION_SHARE = 'predictionShare', // Share a prediction you made
  RANK_SHARE = 'rankShare', // Share your ranking position
}

registerEnumType(UserPostContentType, {
  name: 'UserPostContentType',
  description: 'Type of content in a user post',
});

// Overlay position data (for canvas-based positioning)
@ObjectType()
export class OverlayPosition {
  @Field(() => Number, { nullable: true })
  @Prop({ default: 0.5 })
  x?: number; // 0-1 (percentage from left)

  @Field(() => Number, { nullable: true })
  @Prop({ default: 0.8 })
  y?: number; // 0-1 (percentage from top)

  @Field(() => Number, { nullable: true })
  @Prop({ default: 1.0 })
  scale?: number; // Scale multiplier

  @Field(() => Number, { nullable: true })
  @Prop({ default: 0 })
  rotation?: number; // Degrees
}

// Shared match data embedded in posts
@ObjectType()
export class SharedMatchData {
  @Field()
  @Prop({ required: true })
  matchId: string;

  @Field()
  @Prop({ required: true })
  homeTeam: string;

  @Field()
  @Prop({ required: true })
  awayTeam: string;

  @Field({ nullable: true })
  @Prop()
  homeTeamLogo?: string;

  @Field({ nullable: true })
  @Prop()
  awayTeamLogo?: string;

  @Field(() => Int, { nullable: true })
  @Prop()
  scoreHome?: number;

  @Field(() => Int, { nullable: true })
  @Prop()
  scoreAway?: number;

  @Field({ nullable: true })
  @Prop()
  leagueName?: string;

  @Field({ nullable: true })
  @Prop()
  leagueLogo?: string;

  @Field({ nullable: true })
  @Prop()
  kickoffTime?: Date;

  @Field()
  @Prop({ default: false })
  isLive: boolean;

  @Field()
  @Prop({ default: false })
  isFinished: boolean;

  @Field({ nullable: true })
  @Prop()
  round?: string;
}

// Shared prediction data embedded in posts
@ObjectType()
export class SharedPredictionData {
  @Field(() => ID)
  @Prop({ required: true })
  predictionId: string;

  @Field()
  @Prop({ required: true })
  matchId: string;

  @Field()
  @Prop({ required: true })
  homeTeam: string;

  @Field()
  @Prop({ required: true })
  awayTeam: string;

  @Field({ nullable: true })
  @Prop()
  homeTeamLogo?: string;

  @Field({ nullable: true })
  @Prop()
  awayTeamLogo?: string;

  // User's prediction
  @Field(() => Int, { nullable: true })
  @Prop()
  predictedHome?: number;

  @Field(() => Int, { nullable: true })
  @Prop()
  predictedAway?: number;

  @Field({ nullable: true })
  @Prop()
  predictedWinner?: string; // 'home', 'away', 'draw'

  // Actual result (if match finished)
  @Field(() => Int, { nullable: true })
  @Prop()
  actualHome?: number;

  @Field(() => Int, { nullable: true })
  @Prop()
  actualAway?: number;

  @Field()
  @Prop({ default: false })
  isCorrect: boolean;

  @Field()
  @Prop({ default: false })
  isExactScore: boolean;

  @Field(() => Int)
  @Prop({ default: 0 })
  pointsEarned: number;

  @Field({ nullable: true })
  @Prop()
  quinielaId?: string;

  @Field({ nullable: true })
  @Prop()
  quinielaName?: string;

  @Field({ nullable: true })
  @Prop()
  kickoffTime?: Date;

  @Field()
  @Prop({ default: false })
  isFinished: boolean;
}

// Shared rank/leaderboard data embedded in posts
@ObjectType()
export class SharedRankData {
  @Field(() => ID)
  @Prop({ required: true })
  quinielaId: string;

  @Field()
  @Prop({ required: true })
  quinielaName: string;

  @Field({ nullable: true })
  @Prop()
  quinielaImage?: string;

  @Field(() => Int)
  @Prop({ required: true })
  currentRank: number;

  @Field(() => Int)
  @Prop({ required: true })
  totalMembers: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  totalPoints: number;

  @Field(() => Int, { nullable: true })
  @Prop()
  previousRank?: number;

  @Field(() => Int)
  rankChange: number; // Computed: previousRank - currentRank (positive = moved up)

  @Field({ nullable: true })
  @Prop()
  leagueName?: string;

  @Field({ nullable: true })
  @Prop()
  leagueLogo?: string;
}

// Shared quiniela data embedded in posts
@ObjectType()
export class SharedQuinielaData {
  @Field(() => ID)
  @Prop({ required: true })
  quinielaId: string;

  @Field()
  @Prop({ required: true })
  name: string;

  @Field()
  @Prop({ required: true })
  code: string;

  @Field()
  @Prop({ required: true })
  leagueId: string;

  @Field({ nullable: true })
  @Prop()
  imageUrl?: string;

  @Field({ nullable: true })
  @Prop()
  description?: string;

  @Field()
  @Prop({ required: true })
  ownerName: string;

  @Field(() => Int)
  @Prop({ default: 0 })
  memberCount: number;

  @Field()
  @Prop({ default: false })
  isPublic: boolean;
}

// Author info embedded in posts
@ObjectType()
export class PostAuthor {
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

// Main UserPost schema
@Schema({ timestamps: true, collection: 'user_posts' })
@ObjectType()
export class UserPost {
  @Field(() => ID)
  id: string;

  @Field(() => PostAuthor)
  @Prop({ type: PostAuthor, required: true })
  author: PostAuthor;

  @Field(() => UserPostContentType)
  @Prop({ type: String, enum: UserPostContentType, required: true })
  contentType: UserPostContentType;

  @Field()
  @Prop({ default: '' })
  description: string;

  // For image posts - array of image URLs
  @Field(() => [String], { nullable: true })
  @Prop({ type: [String] })
  imageUrls?: string[];

  // For video posts
  @Field({ nullable: true })
  @Prop()
  videoUrl?: string;

  @Field({ nullable: true })
  @Prop()
  thumbnailUrl?: string;

  // For match shares
  @Field(() => SharedMatchData, { nullable: true })
  @Prop({ type: SharedMatchData })
  sharedMatch?: SharedMatchData;

  // For quiniela shares
  @Field(() => SharedQuinielaData, { nullable: true })
  @Prop({ type: SharedQuinielaData })
  sharedQuiniela?: SharedQuinielaData;

  // For prediction shares
  @Field(() => SharedPredictionData, { nullable: true })
  @Prop({ type: SharedPredictionData })
  sharedPrediction?: SharedPredictionData;

  // For rank/leaderboard shares
  @Field(() => SharedRankData, { nullable: true })
  @Prop({ type: SharedRankData })
  sharedRank?: SharedRankData;

  // Overlay position (for canvas-based positioning of shared content)
  @Field(() => OverlayPosition, { nullable: true })
  @Prop({ type: OverlayPosition })
  overlayPosition?: OverlayPosition;

  // Engagement metrics
  @Field(() => Int)
  @Prop({ default: 0 })
  likesCount: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  commentsCount: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  sharesCount: number;

  @Field(() => Int)
  @Prop({ default: 0 })
  viewsCount: number;

  // Users who liked this post (for checking if current user liked)
  @Prop({ type: [String], default: [] })
  likedBy: string[];

  // Visibility and moderation
  @Field()
  @Prop({ default: true })
  isVisible: boolean;

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

export type UserPostDocument = UserPost & Document;
export const UserPostSchema = SchemaFactory.createForClass(UserPost);

// Indexes for efficient queries
UserPostSchema.index({ 'author.userId': 1, createdAt: -1 });
UserPostSchema.index({ createdAt: -1 });
UserPostSchema.index({ contentType: 1, createdAt: -1 });
UserPostSchema.index({ isVisible: 1, isDeleted: 1, createdAt: -1 });
UserPostSchema.index({ 'sharedQuiniela.quinielaId': 1 });
UserPostSchema.index({ 'sharedMatch.matchId': 1 });
UserPostSchema.index({ 'sharedPrediction.quinielaId': 1 });
UserPostSchema.index({ 'sharedRank.quinielaId': 1 });
