import { Field, ObjectType, ID, Int, Float } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type BettingDailySummaryDocument = BettingDailySummary & Document

// Market stats subdocument
@Schema({ _id: false })
@ObjectType()
export class MarketDailyStats {
  @Prop({ default: 0 })
  @Field(() => Int)
  count: number

  @Prop({ default: 0 })
  @Field(() => Int)
  won: number

  @Prop({ default: 0 })
  @Field(() => Float)
  profit: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgCLV: number
}

export const MarketDailyStatsSchema =
  SchemaFactory.createForClass(MarketDailyStats)

// By market breakdown subdocument
@Schema({ _id: false })
@ObjectType()
export class ByMarketBreakdown {
  @Prop({ type: MarketDailyStatsSchema, default: () => ({}) })
  @Field(() => MarketDailyStats)
  goals_1h: MarketDailyStats

  @Prop({ type: MarketDailyStatsSchema, default: () => ({}) })
  @Field(() => MarketDailyStats)
  corners: MarketDailyStats
}

export const ByMarketBreakdownSchema =
  SchemaFactory.createForClass(ByMarketBreakdown)

// League performance subdocument
@Schema({ _id: false })
@ObjectType()
export class LeagueDailyPerformance {
  @Prop({ required: true })
  @Field(() => Int)
  leagueId: number

  @Prop({ required: true })
  @Field()
  leagueName: string

  @Prop({ default: 0 })
  @Field(() => Int)
  count: number

  @Prop({ default: 0 })
  @Field(() => Int)
  won: number

  @Prop({ default: 0 })
  @Field(() => Float)
  profit: number
}

export const LeagueDailyPerformanceSchema =
  SchemaFactory.createForClass(LeagueDailyPerformance)

// Combo type performance subdocument
@Schema({ _id: false })
@ObjectType()
export class ComboTypeDailyPerformance {
  @Prop({ required: true })
  @Field()
  type: string

  @Prop({ default: 0 })
  @Field(() => Int)
  count: number

  @Prop({ default: 0 })
  @Field(() => Int)
  won: number

  @Prop({ default: 0 })
  @Field(() => Float)
  profit: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgHiddenEdge: number
}

export const ComboTypeDailyPerformanceSchema = SchemaFactory.createForClass(
  ComboTypeDailyPerformance,
)

// Main BettingDailySummary schema
@Schema({ timestamps: true, collection: 'betting_daily_summaries' })
@ObjectType()
export class BettingDailySummary {
  @Field(() => ID)
  _id: string

  @Prop({ required: true, unique: true })
  @Field()
  date: Date

  // Picks summary
  @Prop({ default: 0 })
  @Field(() => Int)
  totalPicks: number

  @Prop({ default: 0 })
  @Field(() => Int)
  picksWon: number

  @Prop({ default: 0 })
  @Field(() => Int)
  picksLost: number

  @Prop({ default: 0 })
  @Field(() => Int)
  picksVoid: number

  @Prop({ default: 0 })
  @Field(() => Int)
  picksCancelled: number

  // Combos summary
  @Prop({ default: 0 })
  @Field(() => Int)
  totalCombos: number

  @Prop({ default: 0 })
  @Field(() => Int)
  combosWon: number

  @Prop({ default: 0 })
  @Field(() => Int)
  combosLost: number

  // Financial
  @Prop({ default: 0 })
  @Field(() => Float)
  totalStaked: number

  @Prop({ default: 0 })
  @Field(() => Float)
  totalProfit: number

  @Prop({ default: 0 })
  @Field(() => Float)
  bankrollBefore: number

  @Prop({ default: 0 })
  @Field(() => Float)
  bankrollAfter: number

  // Metrics
  @Prop({ default: 0 })
  @Field(() => Float)
  avgCLV: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgEdge: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgConfidence: number

  // Breakdowns
  @Prop({ type: ByMarketBreakdownSchema, default: () => ({}) })
  @Field(() => ByMarketBreakdown)
  byMarket: ByMarketBreakdown

  @Prop({ type: [LeagueDailyPerformanceSchema], default: [] })
  @Field(() => [LeagueDailyPerformance])
  byLeague: LeagueDailyPerformance[]

  @Prop({ type: [ComboTypeDailyPerformanceSchema], default: [] })
  @Field(() => [ComboTypeDailyPerformance])
  byComboType: ComboTypeDailyPerformance[]

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const BettingDailySummarySchema =
  SchemaFactory.createForClass(BettingDailySummary)

// Indexes
BettingDailySummarySchema.index({ date: 1 }, { unique: true })
BettingDailySummarySchema.index({ createdAt: -1 })
