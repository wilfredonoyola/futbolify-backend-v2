import { Field, ObjectType, ID, Int, Float } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import {
  PickStatus,
  MarketType,
  MarketDirection,
  TimeWindow,
  SteamMoveDirection,
} from '../enums/betting.enums'

export type BettingPickDocument = BettingPick & Document

// League info subdocument
@Schema({ _id: false })
@ObjectType()
export class PickLeagueInfo {
  @Prop({ required: true })
  @Field(() => Int)
  id: number

  @Prop({ required: true })
  @Field()
  name: string

  @Prop({ required: true })
  @Field()
  country: string

  @Prop({ required: true })
  @Field(() => Int)
  tier: number
}

export const PickLeagueInfoSchema =
  SchemaFactory.createForClass(PickLeagueInfo)

// Team info subdocument
@Schema({ _id: false })
@ObjectType()
export class PickTeamInfo {
  @Prop({ required: true })
  @Field(() => Int)
  id: number

  @Prop({ required: true })
  @Field()
  name: string
}

export const PickTeamInfoSchema = SchemaFactory.createForClass(PickTeamInfo)

// Team stats subdocument for model inputs
@Schema({ _id: false })
@ObjectType()
export class PickTeamStats {
  @Prop()
  @Field({ nullable: true })
  name?: string

  @Prop()
  @Field(() => Float, { nullable: true })
  cornersForAvg?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  cornersAgainstAvg?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  gamesPlayed?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  avgGoals1H?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  avgConceded1H?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  over05_1h_pct?: number

  @Prop()
  @Field({ nullable: true })
  dataQuality?: string
}

export const PickTeamStatsSchema = SchemaFactory.createForClass(PickTeamStats)

// Model inputs subdocument (for debugging/analysis)
@Schema({ _id: false })
@ObjectType()
export class PickModelInputs {
  @Prop()
  @Field({ nullable: true })
  dataSource?: string

  @Prop()
  @Field(() => Float, { nullable: true })
  probBase?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  formAdjustment?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  h2hAdjustment?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  leagueAdjustment?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  contextMultiplier?: number

  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  contextFlags: string[]

  // Team stats for admin detail view
  @Prop({ type: PickTeamStatsSchema })
  @Field(() => PickTeamStats, { nullable: true })
  teamAStats?: PickTeamStats

  @Prop({ type: PickTeamStatsSchema })
  @Field(() => PickTeamStats, { nullable: true })
  teamBStats?: PickTeamStats

  // Goals 1H specific
  @Prop()
  @Field(() => Float, { nullable: true })
  expectedGoals1H?: number

  // Corners specific
  @Prop()
  @Field(() => Float, { nullable: true })
  cornersExpected?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  cornersExpected1H?: number

  // Corners handicap specific
  @Prop()
  @Field(() => Float, { nullable: true })
  handicapLineExpected?: number // Línea que calcula nuestro modelo

  @Prop()
  @Field(() => Float, { nullable: true })
  handicapLineBookmaker?: number // Línea que ofrece el bookmaker

  // Calculation explanation for admin
  @Prop()
  @Field({ nullable: true })
  calculationExplanation?: string

  // Weather data
  @Prop()
  @Field({ nullable: true })
  weatherDescription?: string

  @Prop()
  @Field(() => Float, { nullable: true })
  weatherTemp?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  weatherWind?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  weatherPrecip?: number

  @Prop({ type: [String], default: [] })
  @Field(() => [String], { nullable: true })
  weatherFlags?: string[]
}

export const PickModelInputsSchema =
  SchemaFactory.createForClass(PickModelInputs)

// Steam move subdocument
@Schema({ _id: false })
@ObjectType()
export class PickSteamMove {
  @Prop({ default: false })
  @Field()
  detected: boolean

  @Prop({ enum: SteamMoveDirection })
  @Field(() => SteamMoveDirection, { nullable: true })
  direction?: SteamMoveDirection

  @Prop()
  @Field(() => Float, { nullable: true })
  pctChange?: number

  @Prop()
  @Field({ nullable: true })
  timestamp?: Date
}

export const PickSteamMoveSchema = SchemaFactory.createForClass(PickSteamMove)

// Match result subdocument
@Schema({ _id: false })
@ObjectType()
export class PickMatchResult {
  @Prop()
  @Field({ nullable: true })
  scoreHT?: string

  @Prop()
  @Field({ nullable: true })
  scoreFT?: string

  @Prop()
  @Field(() => Int, { nullable: true })
  cornersTotal?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  cornersHT?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  cornersHome?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  cornersAway?: number
}

export const PickMatchResultSchema =
  SchemaFactory.createForClass(PickMatchResult)

// Main BettingPick schema
@Schema({ timestamps: true, collection: 'betting_picks' })
@ObjectType()
export class BettingPick {
  @Field(() => ID)
  _id: Types.ObjectId

  // Fixture identification
  @Prop({ required: true })
  @Field(() => Int)
  fixtureId: number

  @Prop({ required: true })
  @Field()
  date: Date

  @Prop({ type: PickLeagueInfoSchema, required: true })
  @Field(() => PickLeagueInfo)
  league: PickLeagueInfo

  @Prop({ type: PickTeamInfoSchema, required: true })
  @Field(() => PickTeamInfo)
  teamHome: PickTeamInfo

  @Prop({ type: PickTeamInfoSchema, required: true })
  @Field(() => PickTeamInfo)
  teamAway: PickTeamInfo

  @Prop({ required: true })
  @Field()
  kickoff: Date

  @Prop({ enum: TimeWindow })
  @Field(() => TimeWindow, { nullable: true })
  timeWindow?: TimeWindow

  // Pick details
  @Prop({ required: true, enum: MarketType })
  @Field(() => MarketType)
  market: MarketType

  @Prop({ required: true, enum: MarketDirection })
  @Field(() => MarketDirection)
  direction: MarketDirection

  @Prop({ required: true })
  @Field(() => Float)
  line: number

  // Model calculations
  @Prop({ required: true })
  @Field(() => Float)
  probOwn: number

  @Prop({ required: true })
  @Field(() => Float)
  probImplied: number

  @Prop({ required: true })
  @Field(() => Float)
  edge: number

  @Prop({ required: true, min: 0, max: 100 })
  @Field(() => Int)
  confidenceScore: number

  @Prop({ type: PickModelInputsSchema })
  @Field(() => PickModelInputs, { nullable: true })
  modelInputs?: PickModelInputs

  // Odds tracking
  @Prop()
  @Field(() => Float, { nullable: true })
  oddsAtDetection?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  oddsAtBet?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  oddsAtClose?: number

  @Prop()
  @Field({ nullable: true })
  bestBookmaker?: string

  @Prop()
  @Field(() => Float, { nullable: true })
  pinnacleOdds?: number

  // Steam move tracking
  @Prop({ type: PickSteamMoveSchema })
  @Field(() => PickSteamMove, { nullable: true })
  steamMove?: PickSteamMove

  // Execution
  @Prop({ enum: PickStatus, default: PickStatus.PENDING })
  @Field(() => PickStatus)
  status: PickStatus

  @Prop()
  @Field(() => Float, { nullable: true })
  stake?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  profit?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  clv?: number

  // Match result
  @Prop({ type: PickMatchResultSchema })
  @Field(() => PickMatchResult, { nullable: true })
  matchResult?: PickMatchResult

  // Metadata
  @Prop({ default: false })
  @Field()
  telegramAlertSent: boolean

  @Prop({ default: false })
  @Field()
  inCombo: boolean

  @Prop({ type: Types.ObjectId, ref: 'BettingCombo' })
  @Field(() => ID, { nullable: true })
  comboId?: Types.ObjectId

  // Bet tracking - did the user actually place this bet?
  @Prop({ default: false })
  @Field()
  betPlaced: boolean

  @Prop()
  @Field({ nullable: true })
  betPlacedAt?: Date

  @Prop()
  @Field(() => Float, { nullable: true })
  betAmount?: number

  // Human-readable reasons for the pick (shown in Telegram)
  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  reasons: string[]

  // Star rating 1-5 based on edge and confidence
  @Prop({ min: 1, max: 5, default: 3 })
  @Field(() => Int)
  stars: number

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const BettingPickSchema = SchemaFactory.createForClass(BettingPick)

// Indexes
BettingPickSchema.index({ date: 1, 'league.id': 1 })
BettingPickSchema.index({ fixtureId: 1 })
BettingPickSchema.index({ status: 1 })
BettingPickSchema.index({ market: 1 })
BettingPickSchema.index({ kickoff: 1 })
BettingPickSchema.index({ createdAt: -1 })
BettingPickSchema.index({ inCombo: 1, comboId: 1 })
BettingPickSchema.index({ betPlaced: 1, status: 1 })

// Unique index to prevent duplicate picks for same fixture+market+direction
BettingPickSchema.index(
  { fixtureId: 1, market: 1, direction: 1 },
  { unique: true, background: true }
)
