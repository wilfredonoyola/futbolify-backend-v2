import { Field, ObjectType, ID, Int, Float } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import {
  ComboType,
  ComboStatus,
  MarketType,
  MarketDirection,
  TimeWindow,
  PickStatus,
} from '../enums/betting.enums'
import { CorrelationAdjustment } from '../dto/betting.dto'

export type BettingComboDocument = BettingCombo & Document

// Combo leg subdocument
@Schema({ _id: false })
@ObjectType()
export class ComboLeg {
  @Prop({ type: Types.ObjectId, ref: 'BettingPick', required: true })
  @Field(() => ID)
  pickId: Types.ObjectId

  @Prop({ required: true })
  @Field(() => Int)
  fixtureId: number

  @Prop({ required: true })
  @Field(() => Int)
  leagueId: number

  @Prop({ required: true })
  @Field()
  homeTeam: string

  @Prop({ required: true })
  @Field()
  awayTeam: string

  @Prop({ required: true, enum: MarketType })
  @Field(() => MarketType)
  market: MarketType

  @Prop({ required: true, enum: MarketDirection })
  @Field(() => MarketDirection)
  direction: MarketDirection

  @Prop({ required: true })
  @Field(() => Float)
  odds: number

  @Prop({ required: true })
  @Field(() => Float)
  probOwn: number

  @Prop({ required: true })
  @Field(() => Int)
  confidenceScore: number

  @Prop({ enum: PickStatus, default: PickStatus.PENDING })
  @Field(() => PickStatus)
  result: PickStatus
}

export const ComboLegSchema = SchemaFactory.createForClass(ComboLeg)

// Correlation adjustment subdocument (Mongoose-only, GraphQL type defined in betting.dto.ts)
@Schema({ _id: false })
export class SchemaCorrelationAdjustment {
  @Prop({ required: true })
  factor: string

  @Prop({ required: true })
  value: number
}

export const SchemaCorrelationAdjustmentSchema =
  SchemaFactory.createForClass(SchemaCorrelationAdjustment)

// Correlation info subdocument
@Schema({ _id: false })
@ObjectType()
export class ComboCorrelation {
  @Prop({ default: 0 })
  @Field(() => Float)
  base: number

  @Prop({ default: 0 })
  @Field(() => Float)
  dynamic: number

  @Prop({ type: [SchemaCorrelationAdjustmentSchema], default: [] })
  @Field(() => [CorrelationAdjustment])
  adjustments: SchemaCorrelationAdjustment[]
}

export const ComboCorrelationSchema =
  SchemaFactory.createForClass(ComboCorrelation)

// Score breakdown subdocument
@Schema({ _id: false })
@ObjectType()
export class ComboScoreBreakdown {
  @Prop({ default: 0 })
  @Field(() => Int)
  evPoints: number

  @Prop({ default: 0 })
  @Field(() => Int)
  correlationPoints: number

  @Prop({ default: 0 })
  @Field(() => Int)
  confidencePoints: number

  @Prop({ default: 0 })
  @Field(() => Int)
  steamPoints: number

  @Prop({ default: 0 })
  @Field(() => Int)
  diversificationPoints: number

  @Prop({ default: 0 })
  @Field(() => Int)
  penalties: number
}

export const ComboScoreBreakdownSchema =
  SchemaFactory.createForClass(ComboScoreBreakdown)

// Main BettingCombo schema
@Schema({ timestamps: true, collection: 'betting_combos' })
@ObjectType()
export class BettingCombo {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ required: true })
  @Field()
  date: Date

  @Prop({ required: true, enum: ComboType })
  @Field(() => ComboType)
  type: ComboType

  @Prop({ default: false })
  @Field()
  sharpConfirmed: boolean

  // Legs
  @Prop({ type: [ComboLegSchema], required: true })
  @Field(() => [ComboLeg])
  legs: ComboLeg[]

  // Correlation
  @Prop({ type: ComboCorrelationSchema, default: () => ({}) })
  @Field(() => ComboCorrelation)
  correlation: ComboCorrelation

  // Probabilities
  @Prop({ required: true })
  @Field(() => Float)
  pCasa: number

  @Prop({ required: true })
  @Field(() => Float)
  pReal: number

  @Prop({ required: true })
  @Field(() => Float)
  hiddenEdge: number

  // Odds and EV
  @Prop({ required: true })
  @Field(() => Float)
  combinedOdds: number

  @Prop({ required: true })
  @Field(() => Float)
  evReal: number

  // Scoring
  @Prop({ required: true, min: 0, max: 100 })
  @Field(() => Int)
  score: number

  @Prop({ type: ComboScoreBreakdownSchema })
  @Field(() => ComboScoreBreakdown, { nullable: true })
  scoreBreakdown?: ComboScoreBreakdown

  // Execution
  @Prop({ enum: ComboStatus, default: ComboStatus.PENDING })
  @Field(() => ComboStatus)
  status: ComboStatus

  @Prop()
  @Field(() => Float, { nullable: true })
  stake?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  profit?: number

  // Metadata
  @Prop({ enum: TimeWindow })
  @Field(() => TimeWindow, { nullable: true })
  timeWindow?: TimeWindow

  @Prop({ default: false })
  @Field()
  telegramAlertSent: boolean

  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  warnings: string[]

  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  contextFlags: string[]

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const BettingComboSchema = SchemaFactory.createForClass(BettingCombo)

// Indexes
BettingComboSchema.index({ date: 1 })
BettingComboSchema.index({ type: 1 })
BettingComboSchema.index({ status: 1 })
BettingComboSchema.index({ 'legs.fixtureId': 1 })
BettingComboSchema.index({ 'legs.pickId': 1 })
BettingComboSchema.index({ createdAt: -1 })
BettingComboSchema.index({ score: -1 })
