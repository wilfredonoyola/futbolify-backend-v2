// MongoDB Schema for Quiniela (Prediction Pool)

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ID, ObjectType, InputType, registerEnumType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

// Quiniela status enum
export enum QuinielaStatus {
  OPEN = 'open',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

registerEnumType(QuinielaStatus, {
  name: 'QuinielaStatus',
  description: 'Status of the quiniela',
});

// Prediction mode enum
export enum PredictionMode {
  SIMPLE = 'simple', // Just pick winner/draw
  DETAILED = 'detailed', // Predict exact scores
}

registerEnumType(PredictionMode, {
  name: 'PredictionMode',
  description: 'Mode of prediction for the quiniela',
});

// Rules for scoring
@ObjectType()
export class QuinielaRules {
  @Field()
  exactScore: number; // Points for exact score prediction

  @Field()
  correctResult: number; // Points for correct winner/draw

  @Field()
  bonusChampion: number; // Bonus points for champion prediction
}

// Prediction for a match
@ObjectType()
export class MatchPrediction {
  @Field()
  matchId: string;

  // For detailed mode (exact scores)
  @Field({ nullable: true })
  homeScore?: number;

  @Field({ nullable: true })
  awayScore?: number;

  // For simple mode (just winner/draw): 'home' | 'draw' | 'away'
  @Field({ nullable: true })
  simplePrediction?: string;

  @Field(() => Date)
  submittedAt: Date;
}

// Member with predictions
@Schema({ _id: true })
@ObjectType()
export class QuinielaMember {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: Types.ObjectId;

  @Prop({ required: true })
  @Field()
  userName: string;

  @Prop()
  @Field({ nullable: true })
  avatarUrl?: string;

  @Prop({ type: [Object], default: [] })
  @Field(() => [MatchPrediction])
  predictions: MatchPrediction[];

  @Prop()
  @Field({ nullable: true })
  championPick?: string; // Team ID

  @Prop({ default: 0 })
  @Field()
  totalPoints: number;

  @Prop({ default: 0 })
  @Field()
  correctPredictions: number;

  @Prop({ default: 0 })
  @Field()
  exactScores: number;

  @Prop()
  @Field({ nullable: true })
  rank?: number;

  @Prop({ default: () => new Date() })
  @Field(() => Date)
  joinedAt: Date;
}

export const QuinielaMemberSchema = SchemaFactory.createForClass(QuinielaMember);

// Main Quiniela schema
@Schema({ timestamps: true, collection: 'quinielas' })
@ObjectType()
export class Quiniela {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Prop({ required: true })
  @Field()
  name: string;

  @Prop({ required: true, unique: true })
  @Field()
  code: string; // Invite code

  // Owner can be null for anonymous quinielas
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  @Field(() => ID, { nullable: true })
  ownerId?: Types.ObjectId;

  @Prop({ required: true })
  @Field()
  ownerName: string;

  // Anonymous creator ID (UUID from client)
  @Prop()
  @Field({ nullable: true })
  anonymousCreatorId?: string;

  // When anonymous quiniela was claimed by authenticated user
  @Prop()
  @Field(() => Date, { nullable: true })
  claimedAt?: Date;

  @Prop({ default: true })
  @Field()
  isPrivate: boolean;

  @Prop({ type: String, enum: QuinielaStatus, default: QuinielaStatus.OPEN })
  @Field(() => QuinielaStatus)
  status: QuinielaStatus;

  @Prop({ type: Object, default: { exactScore: 5, correctResult: 2, bonusChampion: 10 } })
  @Field(() => QuinielaRules)
  rules: QuinielaRules;

  @Prop({ type: String, enum: PredictionMode, default: PredictionMode.SIMPLE })
  @Field(() => PredictionMode)
  predictionMode: PredictionMode;

  @Prop({ type: [QuinielaMemberSchema], default: [] })
  @Field(() => [QuinielaMember])
  members: QuinielaMember[];

  @Prop({ default: 0 })
  @Field()
  memberCount: number;

  @Prop()
  @Field({ nullable: true })
  description?: string;

  @Prop()
  @Field({ nullable: true })
  imageUrl?: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}

export type QuinielaDocument = Quiniela & Document;

export const QuinielaSchema = SchemaFactory.createForClass(Quiniela);

// Indexes
QuinielaSchema.index({ code: 1 }, { unique: true });
QuinielaSchema.index({ ownerId: 1 });
QuinielaSchema.index({ 'members.userId': 1 });
QuinielaSchema.index({ status: 1 });
QuinielaSchema.index({ createdAt: -1 });
