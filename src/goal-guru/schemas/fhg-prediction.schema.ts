import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID, Float, Int } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'

/**
 * Individual factor contribution to P_real
 */
@Schema({ _id: false })
@ObjectType()
export class FhgFactor {
  @Prop({ required: true })
  @Field()
  name: string

  @Prop({ required: true })
  @Field(() => Float)
  value: number

  @Prop({ required: true })
  @Field()
  reason: string
}

export const FhgFactorSchema = SchemaFactory.createForClass(FhgFactor)

/**
 * Edge score breakdown
 */
@Schema({ _id: false })
@ObjectType()
export class FhgEdgeBreakdown {
  @Prop()
  @Field(() => Int, { nullable: true })
  dataQualityScore?: number // 0-25: Quality of underlying data

  @Prop()
  @Field(() => Int, { nullable: true })
  patternScore?: number // 0-25: Strength of G1H patterns

  @Prop()
  @Field(() => Int, { nullable: true })
  contextScore?: number // 0-25: Favorable match context

  @Prop()
  @Field(() => Int, { nullable: true })
  valueScore?: number // 0-25: Value vs market odds
}

export const FhgEdgeBreakdownSchema = SchemaFactory.createForClass(FhgEdgeBreakdown)

export type FhgPredictionDocument = FhgPrediction & Document

/**
 * FHG Prediction Schema
 * Calculated probability with explicit factor breakdown
 */
@Schema({ timestamps: true, collection: 'fhg_predictions' })
@ObjectType()
export class FhgPrediction extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'FhgMatch', required: true })
  @Field(() => ID)
  matchId: Types.ObjectId

  // Denormalized match info
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

  // Base probability calculation
  @Prop({ required: true })
  @Field(() => Float)
  pBase: number // Weighted average before factors

  @Prop({ required: true })
  @Field(() => Float)
  leagueAvgG1H: number

  @Prop({ required: true })
  @Field(() => Float)
  homeG1HRate: number

  @Prop({ required: true })
  @Field(() => Float)
  awayConcedeG1HRate: number

  // Final probability
  @Prop({ required: true })
  @Field(() => Float)
  pReal: number // Final probability after all factors

  // Individual factors applied
  @Prop({ type: [FhgFactorSchema], default: [] })
  @Field(() => [FhgFactor])
  factors: FhgFactor[]

  // Factor values (for quick access)
  @Prop()
  @Field(() => Float, { nullable: true })
  leagueFactor?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  momentumFactor?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  aggressionFactor?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  vulnerabilityFactor?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  contextFactor?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  formFactor?: number

  // Combined factor product
  @Prop()
  @Field(() => Float, { nullable: true })
  totalFactorMultiplier?: number

  // Edge score (0-100)
  @Prop({ required: true })
  @Field(() => Int)
  edgeScore: number

  @Prop({ type: FhgEdgeBreakdownSchema })
  @Field(() => FhgEdgeBreakdown, { nullable: true })
  edgeBreakdown?: FhgEdgeBreakdown

  // Confidence level
  @Prop()
  @Field({ nullable: true })
  confidenceLevel?: string // HIGH, MEDIUM, LOW

  // Notes/warnings
  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  warnings: string[]

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const FhgPredictionSchema = SchemaFactory.createForClass(FhgPrediction)

// Index for match lookup
FhgPredictionSchema.index({ matchId: 1 }, { unique: true })
FhgPredictionSchema.index({ date: 1 })
