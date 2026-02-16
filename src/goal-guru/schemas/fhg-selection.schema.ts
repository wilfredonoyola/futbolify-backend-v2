import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID, Float, Int } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'
import { FhgSignal } from '../enums/fhg-signal.enum'
import { FhgOutcome } from '../enums/fhg-outcome.enum'

export type FhgSelectionDocument = FhgSelection & Document

/**
 * FHG Selection Schema
 * THE MOST IMPORTANT SCHEMA - Actual betting selections with CLV tracking
 */
@Schema({ timestamps: true, collection: 'fhg_selections' })
@ObjectType()
export class FhgSelection extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'FhgMatch', required: true })
  @Field(() => ID)
  matchId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'FhgPrediction', required: true })
  @Field(() => ID)
  predictionId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'FhgOdds', required: true })
  @Field(() => ID)
  oddsId: Types.ObjectId

  // Match info (denormalized for quick access and historical reference)
  @Prop({ required: true })
  @Field()
  homeTeam: string

  @Prop({ required: true })
  @Field()
  awayTeam: string

  @Prop({ required: true })
  @Field()
  leagueCode: string

  @Prop({ required: true })
  @Field()
  date: Date

  @Prop({ required: true })
  @Field()
  kickoffTime: string

  // Signal and value metrics
  @Prop({ type: String, enum: FhgSignal, required: true })
  @Field(() => FhgSignal)
  signal: FhgSignal

  @Prop({ required: true })
  @Field(() => Float)
  marginValor: number // (odds * P_real) - 1

  @Prop({ required: true })
  @Field(() => Float)
  pReal: number // Model probability

  @Prop({ required: true })
  @Field(() => Int)
  edgeScore: number // 0-100

  // Stake info
  @Prop({ required: true })
  @Field(() => Float)
  stakePercentage: number // As percentage of bankroll (e.g., 0.03 = 3%)

  @Prop({ required: true })
  @Field(() => Float)
  oddsAtSelection: number // Odds when selection was made

  @Prop()
  @Field({ nullable: true })
  bookmakerUsed?: string

  // Outcome and settlement
  @Prop({ type: String, enum: FhgOutcome, default: FhgOutcome.PENDING })
  @Field(() => FhgOutcome)
  outcome: FhgOutcome

  @Prop()
  @Field(() => Float, { nullable: true })
  closingOdds?: number // Odds at kickoff

  @Prop()
  @Field(() => Float, { nullable: true })
  clv?: number // Closing Line Value: (oddsAtSelection - closingOdds) / closingOdds

  @Prop()
  @Field(() => Float, { nullable: true })
  profitLoss?: number // In stake units: WON = (odds-1)*stake, LOST = -stake

  @Prop()
  @Field({ nullable: true })
  settledAt?: Date

  // Match result (denormalized after settlement)
  @Prop()
  @Field(() => Int, { nullable: true })
  actualGoals1H?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  minuteFirstGoal?: number

  // Pipeline tracking
  @Prop()
  @Field({ nullable: true })
  pipelineId?: string // ID of the daily pipeline that created this

  @Prop()
  @Field(() => Int, { nullable: true })
  pipelineRank?: number // Rank within the pipeline (by marginValor)

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const FhgSelectionSchema = SchemaFactory.createForClass(FhgSelection)

// Indexes
FhgSelectionSchema.index({ date: 1 })
FhgSelectionSchema.index({ outcome: 1 })
FhgSelectionSchema.index({ matchId: 1 }, { unique: true })
FhgSelectionSchema.index({ pipelineId: 1 })
FhgSelectionSchema.index({ createdAt: -1 })
