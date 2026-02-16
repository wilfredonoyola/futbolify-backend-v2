import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID, Float } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'
import GraphQLJSON from 'graphql-type-json'

/**
 * Bookmaker odds entry
 */
@Schema({ _id: false })
@ObjectType()
export class FhgBookmakerOdds {
  @Prop({ required: true })
  @Field()
  bookmaker: string

  @Prop()
  @Field(() => Float, { nullable: true })
  g1hYes?: number | null

  @Prop()
  @Field(() => Float, { nullable: true })
  g1hNo?: number | null

  @Prop()
  @Field({ nullable: true })
  lastUpdate?: Date
}

export const FhgBookmakerOddsSchema = SchemaFactory.createForClass(FhgBookmakerOdds)

export type FhgOddsDocument = FhgOdds & Document

/**
 * FHG Odds Schema
 * Odds from multiple bookmakers + closing odds for CLV calculation
 */
@Schema({ timestamps: true, collection: 'fhg_odds' })
@ObjectType()
export class FhgOdds extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'FhgMatch', required: true })
  @Field(() => ID)
  matchId: Types.ObjectId

  // Denormalized match info for quick access
  @Prop({ required: true })
  @Field()
  homeTeam: string

  @Prop({ required: true })
  @Field()
  awayTeam: string

  @Prop({ required: true })
  @Field()
  date: Date

  // Odds from multiple bookmakers
  @Prop({ type: [FhgBookmakerOddsSchema], default: [] })
  @Field(() => [FhgBookmakerOdds])
  bookmakers: FhgBookmakerOdds[]

  // Best available odds (calculated)
  @Prop()
  @Field(() => Float, { nullable: true })
  bestG1hYes?: number

  @Prop()
  @Field({ nullable: true })
  bestG1hYesBookmaker?: string

  @Prop()
  @Field(() => Float, { nullable: true })
  bestG1hNo?: number

  @Prop()
  @Field({ nullable: true })
  bestG1hNoBookmaker?: string

  // Average market odds
  @Prop()
  @Field(() => Float, { nullable: true })
  avgG1hYes?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  avgG1hNo?: number

  // Implied probability from market
  @Prop()
  @Field(() => Float, { nullable: true })
  impliedProbG1hYes?: number

  // Closing odds (captured at kickoff for CLV)
  @Prop()
  @Field(() => Float, { nullable: true })
  closingG1hYes?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  closingG1hNo?: number

  @Prop()
  @Field({ nullable: true })
  closingCapturedAt?: Date

  @Prop()
  @Field({ nullable: true })
  lastUpdate?: Date

  // Whether odds are from real API or estimated
  @Prop({ default: false })
  @Field({ defaultValue: false })
  isRealOdds: boolean

  // H2H (1X2) data used for improved estimation
  @Prop({ type: Object })
  @Field(() => GraphQLJSON, { nullable: true, description: 'H2H odds used for estimation (JSON)' })
  h2hData?: Record<string, unknown>

  // H2H-based adjustment applied to base probability
  @Prop()
  @Field(() => Float, { nullable: true, description: 'Adjustment from H2H correlation (-0.10 to +0.12)' })
  h2hAdjustment?: number

  // Reason for estimation adjustment
  @Prop()
  @Field({ nullable: true, description: 'Why this odds value was estimated' })
  estimationReason?: string

  // Confidence in estimation
  @Prop()
  @Field({ nullable: true, description: 'Confidence level: HIGH, MEDIUM, LOW' })
  estimationConfidence?: string

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const FhgOddsSchema = SchemaFactory.createForClass(FhgOdds)

// Index for match lookup
FhgOddsSchema.index({ matchId: 1 }, { unique: true })
FhgOddsSchema.index({ date: 1 })
