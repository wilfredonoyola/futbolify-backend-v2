import { Field, ObjectType, ID, Int, Float } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'
import {
  LeagueTier,
  SeasonType,
  BookmakerQuality,
} from '../enums/betting.enums'

export type BettingLeagueDocument = BettingLeague & Document

// League statistics subdocument
@Schema({ _id: false })
@ObjectType()
export class LeagueStats {
  @Prop({ default: 0 })
  @Field(() => Float)
  avgGoals1H: number

  @Prop({ default: 0 })
  @Field(() => Float)
  over05_1H_pct: number

  @Prop({ default: 0 })
  @Field(() => Float)
  over15_1H_pct: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgCornersPerMatch: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgShotsPerMatch: number

  @Prop({ default: 0 })
  @Field(() => Float)
  bts1H_pct: number

  @Prop({ default: 0 })
  @Field(() => Int)
  matchesPlayed: number

  @Prop()
  @Field({ nullable: true })
  lastUpdated?: Date
}

export const LeagueStatsSchema = SchemaFactory.createForClass(LeagueStats)

// Schedule configuration subdocument
@Schema({ _id: false })
@ObjectType()
export class LeagueSchedule {
  @Prop()
  @Field()
  primaryDay: string

  @Prop()
  @Field({ nullable: true })
  secondaryDay?: string

  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  typicalKickoffs: string[]

  @Prop()
  @Field()
  timezone: string

  @Prop()
  @Field(() => Int)
  utcOffset: number

  @Prop({ default: false })
  @Field()
  windowA: boolean

  @Prop({ default: false })
  @Field()
  windowB: boolean
}

export const LeagueScheduleSchema = SchemaFactory.createForClass(LeagueSchedule)

// Model configuration subdocument
@Schema({ _id: false })
@ObjectType()
export class LeagueModelConfig {
  @Prop({ default: 0 })
  @Field(() => Float)
  leagueBonus: number

  @Prop({ default: 0 })
  @Field(() => Float)
  correlationAdj: number

  @Prop({ default: 9.5 })
  @Field(() => Float)
  cornersBaseline: number

  @Prop({ default: 1.2 })
  @Field(() => Float)
  goalsBaseline: number

  @Prop({ default: 22 })
  @Field(() => Float)
  shotsBaseline: number

  @Prop({ enum: BookmakerQuality, default: BookmakerQuality.MEDIUM })
  @Field(() => BookmakerQuality)
  bookmakerQuality: BookmakerQuality
}

export const LeagueModelConfigSchema =
  SchemaFactory.createForClass(LeagueModelConfig)

// API-Football coverage subdocument
@Schema({ _id: false })
@ObjectType()
export class LeagueCoverage {
  @Prop({ default: false })
  @Field()
  events: boolean

  @Prop({ default: false })
  @Field()
  lineups: boolean

  @Prop({ default: false })
  @Field()
  statisticsFixtures: boolean

  @Prop({ default: false })
  @Field()
  statisticsPlayers: boolean

  @Prop({ default: false })
  @Field()
  standings: boolean

  @Prop({ default: false })
  @Field()
  players: boolean

  @Prop({ default: false })
  @Field()
  topScorers: boolean

  @Prop({ default: false })
  @Field()
  predictions: boolean

  @Prop({ default: false })
  @Field()
  odds: boolean
}

export const LeagueCoverageSchema =
  SchemaFactory.createForClass(LeagueCoverage)

// Main BettingLeague schema
@Schema({ timestamps: true, collection: 'betting_leagues' })
@ObjectType()
export class BettingLeague {
  @Field(() => ID)
  _id: string

  @Prop({ required: true })
  @Field()
  name: string

  @Prop({ required: true })
  @Field()
  country: string

  @Prop({ required: true })
  @Field(() => Int)
  division: number

  @Prop({ required: true, enum: [1, 2, 3, 4] })
  @Field(() => Int)
  tier: number

  @Prop({ default: false })
  @Field()
  isActive: boolean

  // API identifiers
  @Prop({ required: true, unique: true })
  @Field(() => Int)
  apiFootballId: number

  @Prop({ sparse: true })
  @Field({ nullable: true })
  oddsApiSportKey?: string

  @Prop({ default: false })
  @Field()
  hasOddsApi: boolean

  // Season info
  @Prop()
  @Field({ nullable: true })
  season?: string

  @Prop({ enum: SeasonType })
  @Field(() => SeasonType, { nullable: true })
  seasonType?: SeasonType

  @Prop()
  @Field({ nullable: true })
  seasonStart?: Date

  @Prop()
  @Field({ nullable: true })
  seasonEnd?: Date

  // Nested objects
  @Prop({ type: LeagueStatsSchema, default: () => ({}) })
  @Field(() => LeagueStats)
  stats: LeagueStats

  @Prop({ type: LeagueScheduleSchema })
  @Field(() => LeagueSchedule, { nullable: true })
  schedule?: LeagueSchedule

  @Prop({ type: LeagueModelConfigSchema, default: () => ({}) })
  @Field(() => LeagueModelConfig)
  modelConfig: LeagueModelConfig

  @Prop({ type: LeagueCoverageSchema })
  @Field(() => LeagueCoverage, { nullable: true })
  coverage?: LeagueCoverage

  // Assets
  @Prop()
  @Field({ nullable: true })
  logo?: string

  // Stats tracking
  @Prop({ default: 0 })
  @Field(() => Int)
  fixturesAnalyzed: number

  @Prop({ default: 0 })
  @Field(() => Int)
  picksGenerated: number

  // Metadata
  @Prop()
  @Field({ nullable: true })
  notes?: string

  @Prop()
  @Field({ nullable: true })
  lastSynced?: Date

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const BettingLeagueSchema = SchemaFactory.createForClass(BettingLeague)

// Indexes
BettingLeagueSchema.index({ apiFootballId: 1 }, { unique: true })
BettingLeagueSchema.index({ isActive: 1, tier: 1 })
BettingLeagueSchema.index({ country: 1 })
BettingLeagueSchema.index({ oddsApiSportKey: 1 }, { sparse: true })
