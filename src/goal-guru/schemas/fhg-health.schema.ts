import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID, Float, Int } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'
import { FhgStatus } from '../enums/fhg-status.enum'

/**
 * Health metrics by league
 */
@Schema({ _id: false })
@ObjectType()
export class FhgLeagueHealthMetrics {
  @Prop({ required: true })
  @Field()
  leagueCode: string

  @Prop({ required: true })
  @Field()
  leagueName: string

  @Prop({ required: true })
  @Field(() => Int)
  totalSelections: number

  @Prop({ required: true })
  @Field(() => Int)
  won: number

  @Prop({ required: true })
  @Field(() => Int)
  lost: number

  @Prop({ required: true })
  @Field(() => Float)
  hitRate: number

  @Prop({ required: true })
  @Field(() => Float)
  avgClv: number

  @Prop({ required: true })
  @Field(() => Float)
  roi: number
}

export const FhgLeagueHealthMetricsSchema = SchemaFactory.createForClass(
  FhgLeagueHealthMetrics
)

/**
 * Health metrics by signal
 */
@Schema({ _id: false })
@ObjectType()
export class FhgSignalHealthMetrics {
  @Prop({ required: true })
  @Field()
  signal: string

  @Prop({ required: true })
  @Field(() => Int)
  totalSelections: number

  @Prop({ required: true })
  @Field(() => Int)
  won: number

  @Prop({ required: true })
  @Field(() => Int)
  lost: number

  @Prop({ required: true })
  @Field(() => Float)
  hitRate: number

  @Prop({ required: true })
  @Field(() => Float)
  avgClv: number

  @Prop({ required: true })
  @Field(() => Float)
  roi: number
}

export const FhgSignalHealthMetricsSchema = SchemaFactory.createForClass(
  FhgSignalHealthMetrics
)

/**
 * Health alert
 */
@Schema({ _id: false })
@ObjectType()
export class FhgHealthAlert {
  @Prop({ required: true })
  @Field()
  severity: string // WARNING, CRITICAL

  @Prop({ required: true })
  @Field()
  message: string

  @Prop({ required: true })
  @Field()
  recommendation: string
}

export const FhgHealthAlertSchema = SchemaFactory.createForClass(FhgHealthAlert)

export type FhgHealthDocument = FhgHealth & Document

/**
 * FHG Health Schema
 * Periodic health snapshots with CLV as the supreme metric
 */
@Schema({ timestamps: true, collection: 'fhg_health' })
@ObjectType()
export class FhgHealth extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ type: String, enum: FhgStatus, required: true })
  @Field(() => FhgStatus)
  status: FhgStatus

  @Prop({ required: true })
  @Field()
  reportDate: Date

  @Prop({ required: true })
  @Field()
  periodStart: Date

  @Prop({ required: true })
  @Field()
  periodEnd: Date

  // Overall metrics
  @Prop({ required: true })
  @Field(() => Int)
  totalSelections: number

  @Prop({ required: true })
  @Field(() => Int)
  settledSelections: number

  @Prop({ required: true })
  @Field(() => Int)
  pendingSelections: number

  @Prop({ required: true })
  @Field(() => Int)
  won: number

  @Prop({ required: true })
  @Field(() => Int)
  lost: number

  @Prop({ required: true })
  @Field(() => Int)
  voided: number

  // Key metrics
  @Prop({ required: true })
  @Field(() => Float)
  hitRate: number // won / (won + lost)

  @Prop({ required: true })
  @Field(() => Float)
  avgClv: number // Average CLV across all selections

  @Prop({ required: true })
  @Field(() => Float)
  roi: number // Total profit / total staked

  @Prop({ required: true })
  @Field(() => Float)
  totalProfitLoss: number // Sum of all profit/loss

  @Prop({ required: true })
  @Field(() => Float)
  totalStaked: number // Sum of all stakes

  // CLV by period
  @Prop()
  @Field(() => Float, { nullable: true })
  clv7d?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  clv30d?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  clvAllTime?: number

  // Breakdowns
  @Prop({ type: [FhgLeagueHealthMetricsSchema], default: [] })
  @Field(() => [FhgLeagueHealthMetrics])
  byLeague: FhgLeagueHealthMetrics[]

  @Prop({ type: [FhgSignalHealthMetricsSchema], default: [] })
  @Field(() => [FhgSignalHealthMetrics])
  bySignal: FhgSignalHealthMetrics[]

  // Alerts
  @Prop({ type: [FhgHealthAlertSchema], default: [] })
  @Field(() => [FhgHealthAlert])
  alerts: FhgHealthAlert[]

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const FhgHealthSchema = SchemaFactory.createForClass(FhgHealth)

// Index for date-based queries
FhgHealthSchema.index({ reportDate: -1 })
