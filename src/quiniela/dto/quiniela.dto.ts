// DTOs for Quiniela GraphQL API

import { Field, InputType, ObjectType, ID } from '@nestjs/graphql';
import { QuinielaRules, MatchPrediction, QuinielaMember, QuinielaStatus, PredictionMode } from '../schemas/quiniela.schema';

// Input: Create quiniela
@InputType()
export class CreateQuinielaInput {
  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ defaultValue: true })
  isPrivate: boolean;

  @Field({ nullable: true })
  imageUrl?: string;

  // For anonymous creation - client generates UUID
  @Field({ nullable: true })
  anonymousCreatorId?: string;

  // Owner name for anonymous creators
  @Field({ nullable: true })
  ownerName?: string;

  // Prediction mode: simple (just winner) or detailed (exact scores)
  @Field(() => PredictionMode, { defaultValue: PredictionMode.SIMPLE })
  predictionMode: PredictionMode;
}

// Input: Claim anonymous quiniela
@InputType()
export class ClaimQuinielaInput {
  @Field()
  code: string;

  @Field()
  anonymousCreatorId: string;
}

// Input: Update quiniela (owner only)
@InputType()
export class UpdateQuinielaInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  isPrivate?: boolean;

  @Field({ nullable: true })
  imageUrl?: string;
}

// Input: Save prediction
@InputType()
export class SavePredictionInput {
  @Field()
  matchId: string;

  // For detailed mode (exact scores)
  @Field({ nullable: true })
  homeScore?: number;

  @Field({ nullable: true })
  awayScore?: number;

  // For simple mode: 'home' | 'draw' | 'away'
  @Field({ nullable: true })
  simplePrediction?: string;
}

// Input: Save multiple predictions
@InputType()
export class SavePredictionsInput {
  @Field(() => [SavePredictionInput])
  predictions: SavePredictionInput[];
}

// Output: Quiniela invite
@ObjectType()
export class QuinielaInvite {
  @Field(() => ID)
  quinielaId: string;

  @Field()
  quinielaName: string;

  @Field()
  ownerName: string;

  @Field()
  code: string;

  @Field()
  inviteUrl: string;

  @Field()
  memberCount: number;

  @Field()
  isPrivate: boolean;

  // True if created without an account - client should prompt for signup
  @Field()
  isAnonymous: boolean;

  // Anonymous creator ID (for claiming later)
  @Field({ nullable: true })
  anonymousCreatorId?: string;
}

// Output: Public quiniela info (for join page)
@ObjectType()
export class QuinielaPublicInfo {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field(() => ID, { nullable: true })
  ownerId?: string;

  @Field()
  ownerName: string;

  @Field()
  memberCount: number;

  @Field()
  isPrivate: boolean;

  @Field(() => QuinielaStatus)
  status: QuinielaStatus;

  @Field(() => PredictionMode)
  predictionMode: PredictionMode;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  imageUrl?: string;

  @Field(() => Date)
  createdAt: Date;
}

// Output: Leaderboard entry
@ObjectType()
export class LeaderboardEntry {
  @Field()
  rank: number;

  @Field(() => ID)
  memberId: string;

  @Field(() => ID)
  userId: string;

  @Field()
  userName: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field()
  totalPoints: number;

  @Field()
  correctPredictions: number;

  @Field()
  exactScores: number;

  @Field({ nullable: true })
  championPick?: string;
}

// Output: Member prediction detail
@ObjectType()
export class MemberPredictionDetail {
  @Field()
  matchId: string;

  @Field()
  homeScore: number;

  @Field()
  awayScore: number;

  @Field(() => Date)
  submittedAt: Date;

  @Field({ nullable: true })
  pointsEarned?: number;

  @Field({ nullable: true })
  isExact?: boolean;

  @Field({ nullable: true })
  isCorrectResult?: boolean;
}

// Output: My quiniela status
@ObjectType()
export class MyQuinielaStatus {
  @Field(() => ID)
  quinielaId: string;

  @Field()
  quinielaName: string;

  @Field()
  myRank: number;

  @Field()
  myPoints: number;

  @Field()
  totalMembers: number;

  @Field()
  predictionsSubmitted: number;

  @Field({ nullable: true })
  championPick?: string;
}

// ============ ADMIN EMAIL FLOW ============

// Input: Set admin email for anonymous quiniela
@InputType()
export class SetAdminEmailInput {
  @Field()
  code: string;

  @Field()
  anonymousCreatorId: string;

  @Field()
  email: string;
}

// Input: Verify admin email with code
@InputType()
export class VerifyAdminEmailInput {
  @Field()
  code: string;

  @Field()
  verificationCode: string;
}

// Input: Validate admin token (magic link)
@InputType()
export class ValidateAdminTokenInput {
  @Field()
  code: string;

  @Field()
  token: string;
}

// Output: Admin email set result
@ObjectType()
export class SetAdminEmailResult {
  @Field()
  success: boolean;

  @Field()
  message: string;
}

// Output: Verify admin email result
@ObjectType()
export class VerifyAdminEmailResult {
  @Field()
  success: boolean;

  @Field()
  message: string;

  // Admin token for future access (only returned on success)
  @Field({ nullable: true })
  adminToken?: string;

  // Admin URL with token
  @Field({ nullable: true })
  adminUrl?: string;
}

// Output: Validate admin token result
@ObjectType()
export class ValidateAdminTokenResult {
  @Field()
  isValid: boolean;

  @Field({ nullable: true })
  quinielaId?: string;

  @Field({ nullable: true })
  quinielaName?: string;

  @Field({ nullable: true })
  message?: string;
}
