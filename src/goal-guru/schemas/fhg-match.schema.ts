import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID, Int } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'

/**
 * Match context information for analysis
 */
@Schema({ _id: false })
@ObjectType()
export class FhgMatchContext {
  @Prop()
  @Field({ nullable: true })
  motivation?: string // TITLE, RELEGATION, MIDTABLE, CUP_FINAL, etc.

  @Prop({ default: false })
  @Field()
  isDerby: boolean

  @Prop()
  @Field(() => Int, { nullable: true })
  homeRestDays?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  awayRestDays?: number

  @Prop()
  @Field({ nullable: true })
  homeLastResult?: string // W, D, L

  @Prop()
  @Field({ nullable: true })
  awayLastResult?: string

  @Prop()
  @Field(() => Int, { nullable: true })
  homeLeaguePosition?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  awayLeaguePosition?: number

  @Prop()
  @Field({ nullable: true })
  weather?: string
}

export const FhgMatchContextSchema = SchemaFactory.createForClass(FhgMatchContext)

export type FhgMatchDocument = FhgMatch & Document

/**
 * FHG Match Schema
 * Match information with context for G1H analysis
 */
@Schema({ timestamps: true, collection: 'fhg_matches' })
@ObjectType()
export class FhgMatch extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ required: true })
  @Field()
  leagueCode: string

  @Prop()
  @Field({ nullable: true })
  apiFootballId?: string

  @Prop({ required: true })
  @Field()
  homeTeam: string

  @Prop({ required: true })
  @Field()
  awayTeam: string

  @Prop({ required: true })
  @Field()
  date: Date

  @Prop({ required: true })
  @Field()
  kickoffTime: string

  @Prop({ default: 'SCHEDULED' })
  @Field()
  status: string // SCHEDULED, LIVE, HALFTIME, FINISHED, POSTPONED, CANCELLED

  // Results (filled after match)
  @Prop()
  @Field(() => Int, { nullable: true })
  homeScore1H?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  awayScore1H?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  homeScoreFT?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  awayScoreFT?: number

  @Prop()
  @Field(() => Int, { nullable: true })
  minuteFirstGoal?: number

  @Prop({ default: false })
  @Field()
  hadG1H: boolean

  // Context for analysis
  @Prop({ type: FhgMatchContextSchema })
  @Field(() => FhgMatchContext, { nullable: true })
  context?: FhgMatchContext

  // References to teams (denormalized for quick access)
  @Prop({ type: Types.ObjectId, ref: 'FhgTeam' })
  @Field(() => ID, { nullable: true })
  homeTeamId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'FhgTeam' })
  @Field(() => ID, { nullable: true })
  awayTeamId?: Types.ObjectId

  @Prop()
  @Field({ nullable: true })
  season?: string

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const FhgMatchSchema = SchemaFactory.createForClass(FhgMatch)

// Index for efficient date-based queries
FhgMatchSchema.index({ date: 1, status: 1 })
FhgMatchSchema.index({ leagueCode: 1, date: 1 })
