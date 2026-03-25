import { Field, ObjectType, ID, Int, Float } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type BettingSettingsDocument = BettingSettings & Document

// Thresholds subdocument
@Schema({ _id: false })
@ObjectType()
export class BettingThresholds {
  @Prop({ default: 0.05 })
  @Field(() => Float)
  minEdge: number

  @Prop({ default: 0.05 })
  @Field(() => Float)
  minComboEV: number

  @Prop({ default: 40 })
  @Field(() => Int)
  minScore: number

  @Prop({ default: 8 })
  @Field(() => Int)
  minGamesPlayed: number
}

export const BettingThresholdsSchema =
  SchemaFactory.createForClass(BettingThresholds)

// Stakes configuration subdocument
@Schema({ _id: false })
@ObjectType()
export class BettingStakesConfig {
  @Prop({ default: 0.2 })
  @Field(() => Float)
  kellyFraction: number

  // Fixed stake amount (if set, overrides percentage calculation)
  @Prop()
  @Field(() => Float, { nullable: true })
  fixedStake?: number

  // Use fixed stake instead of Kelly/percentage calculation
  @Prop({ default: false })
  @Field()
  useFixedStake: boolean

  @Prop({ default: 0.03 })
  @Field(() => Float)
  maxStakeIndividualPct: number

  @Prop({ default: 0.02 })
  @Field(() => Float)
  maxStakeComboPct: number

  @Prop({ default: 0.15 })
  @Field(() => Float)
  maxDailyExposurePct: number

  @Prop({ default: 5 })
  @Field(() => Int)
  maxPicksPerDay: number

  @Prop({ default: 3 })
  @Field(() => Int)
  maxCombosPerDay: number
}

export const BettingStakesConfigSchema =
  SchemaFactory.createForClass(BettingStakesConfig)

// Anti-tilt configuration subdocument
@Schema({ _id: false })
@ObjectType()
export class BettingAntiTiltConfig {
  @Prop({ default: 0.1 })
  @Field(() => Float)
  stopLossDailyPct: number

  @Prop({ default: 7 })
  @Field(() => Int)
  maxConsecutiveLosses: number
}

export const BettingAntiTiltConfigSchema =
  SchemaFactory.createForClass(BettingAntiTiltConfig)

// API keys subdocument (values should be encrypted in production)
@Schema({ _id: false })
@ObjectType()
export class BettingApiKeys {
  @Prop()
  @Field({ nullable: true })
  apiFootball?: string

  @Prop()
  @Field({ nullable: true })
  theOddsApi?: string
}

export const BettingApiKeysSchema =
  SchemaFactory.createForClass(BettingApiKeys)

// Cron schedule subdocument
@Schema({ _id: false })
@ObjectType()
export class BettingCronSchedule {
  @Prop({ default: '0 21 * * 5' }) // Friday 9 PM
  @Field()
  nightlyAnalysis: string

  @Prop({ default: '30 6 * * 6' }) // Saturday 6:30 AM
  @Field()
  preMatchCheck: string

  @Prop({ default: '0 15 * * 6' }) // Saturday 3 PM
  @Field()
  resultCollection: string

  @Prop({ default: '0 6 * * 1' }) // Monday 6 AM
  @Field()
  leagueSync: string

  @Prop({ default: '30 8 * * 1' }) // Monday 8:30 AM
  @Field()
  statsUpdater: string
}

export const BettingCronScheduleSchema =
  SchemaFactory.createForClass(BettingCronSchedule)

// Active league reference subdocument
@Schema({ _id: false })
@ObjectType()
export class ActiveLeagueRef {
  @Prop({ required: true })
  @Field(() => Int)
  id: number

  @Prop({ required: true })
  @Field()
  name: string

  @Prop({ required: true })
  @Field(() => Int)
  tier: number

  @Prop({ default: true })
  @Field()
  isActive: boolean
}

export const ActiveLeagueRefSchema =
  SchemaFactory.createForClass(ActiveLeagueRef)

// Main BettingSettings schema
@Schema({ timestamps: true, collection: 'betting_settings' })
@ObjectType()
export class BettingSettings {
  @Field(() => ID)
  _id: string

  @Prop({ required: true })
  @Field()
  adminId: string

  // Core settings
  @Prop({ default: 100 })
  @Field(() => Float)
  bankroll: number

  @Prop({ default: true })
  @Field()
  isActive: boolean

  @Prop({ default: true })
  @Field()
  telegramAlertsOn: boolean

  // Configuration objects
  @Prop({ type: BettingThresholdsSchema, default: () => ({}) })
  @Field(() => BettingThresholds)
  thresholds: BettingThresholds

  @Prop({ type: BettingStakesConfigSchema, default: () => ({}) })
  @Field(() => BettingStakesConfig)
  stakes: BettingStakesConfig

  @Prop({ type: BettingAntiTiltConfigSchema, default: () => ({}) })
  @Field(() => BettingAntiTiltConfig)
  antiTilt: BettingAntiTiltConfig

  @Prop({ type: BettingApiKeysSchema })
  @Field(() => BettingApiKeys, { nullable: true })
  apiKeys?: BettingApiKeys

  @Prop({ type: BettingCronScheduleSchema, default: () => ({}) })
  @Field(() => BettingCronSchedule)
  cronSchedule: BettingCronSchedule

  @Prop({ type: [ActiveLeagueRefSchema], default: [] })
  @Field(() => [ActiveLeagueRef])
  activeLeagues: ActiveLeagueRef[]

  // Tracking
  @Prop({ default: 0 })
  @Field(() => Int)
  currentStreak: number

  @Prop({ default: 0 })
  @Field(() => Int)
  maxWinStreak: number

  @Prop({ default: 0 })
  @Field(() => Int)
  maxLoseStreak: number

  @Prop({ default: 0 })
  @Field(() => Int)
  consecutiveLosses: number

  @Prop()
  @Field({ nullable: true })
  lastPausedAt?: Date

  @Prop()
  @Field({ nullable: true })
  pauseReason?: string

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const BettingSettingsSchema =
  SchemaFactory.createForClass(BettingSettings)

// Indexes
BettingSettingsSchema.index({ adminId: 1 }, { unique: true })
