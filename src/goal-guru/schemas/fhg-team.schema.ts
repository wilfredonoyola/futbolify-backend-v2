import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID, Float, Int } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'

/**
 * Recent form entry for G1H tracking
 */
@Schema({ _id: false })
@ObjectType()
export class FhgRecentForm {
  @Prop({ required: true })
  @Field()
  date: Date

  @Prop({ required: true })
  @Field()
  opponent: string

  @Prop({ required: true })
  @Field()
  isHome: boolean

  @Prop({ required: true })
  @Field()
  hadG1H: boolean

  @Prop()
  @Field(() => Int, { nullable: true })
  minuteFirstGoal?: number

  @Prop({ required: true })
  @Field(() => Int)
  goalsScored1H: number

  @Prop({ required: true })
  @Field(() => Int)
  goalsConceded1H: number
}

export const FhgRecentFormSchema = SchemaFactory.createForClass(FhgRecentForm)

export type FhgTeamDocument = FhgTeam & Document

/**
 * FHG Team Schema
 * Team stats specifically for G1H analysis - home/away splits + recent form
 */
@Schema({ timestamps: true, collection: 'fhg_teams' })
@ObjectType()
export class FhgTeam extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ required: true })
  @Field()
  name: string

  @Prop({ required: true })
  @Field()
  leagueCode: string

  @Prop()
  @Field({ nullable: true })
  apiFootballId?: number

  // Season stats
  @Prop({ required: true })
  @Field()
  season: string

  // Home stats for G1H
  @Prop({ default: 0 })
  @Field(() => Int)
  homeMatchesPlayed: number

  @Prop({ default: 0 })
  @Field(() => Int)
  homeMatchesWithG1H: number

  @Prop({ default: 0 })
  @Field(() => Float)
  homeG1HRate: number

  @Prop({ default: 0 })
  @Field(() => Int)
  homeGoalsScored1H: number

  @Prop({ default: 0 })
  @Field(() => Int)
  homeGoalsConceded1H: number

  @Prop()
  @Field(() => Float, { nullable: true })
  homeAvgMinuteFirstGoal?: number

  // Away stats for G1H
  @Prop({ default: 0 })
  @Field(() => Int)
  awayMatchesPlayed: number

  @Prop({ default: 0 })
  @Field(() => Int)
  awayMatchesWithG1H: number

  @Prop({ default: 0 })
  @Field(() => Float)
  awayG1HRate: number

  @Prop({ default: 0 })
  @Field(() => Int)
  awayGoalsScored1H: number

  @Prop({ default: 0 })
  @Field(() => Int)
  awayGoalsConceded1H: number

  @Prop()
  @Field(() => Float, { nullable: true })
  awayAvgMinuteFirstGoal?: number

  // Combined stats
  @Prop({ default: 0 })
  @Field(() => Int)
  totalMatchesPlayed: number

  @Prop({ default: 0 })
  @Field(() => Float)
  overallG1HRate: number

  // Recent form - last 5 matches
  @Prop({ type: [FhgRecentFormSchema], default: [] })
  @Field(() => [FhgRecentForm])
  recentForm: FhgRecentForm[]

  // Calculated metrics
  @Prop()
  @Field(() => Float, { nullable: true })
  recentG1HRate?: number // G1H rate in last 5 matches

  @Prop()
  @Field(() => Float, { nullable: true })
  momentumScore?: number // Comparison of recent vs season

  @Prop()
  @Field({ nullable: true })
  lastStatsUpdate?: Date

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const FhgTeamSchema = SchemaFactory.createForClass(FhgTeam)

// Compound index for efficient lookups
FhgTeamSchema.index({ leagueCode: 1, name: 1, season: 1 }, { unique: true })
