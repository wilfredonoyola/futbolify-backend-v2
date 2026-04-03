import { Field, ObjectType, ID, Int, Float } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type RefereeStatsDocument = RefereeStats & Document

/**
 * Referee Statistics Schema
 * v1.5.0: Added for cards model improvement
 *
 * Stores historical referee statistics for cards prediction.
 * Referee style is a major factor in yellow card totals (45% weight in model).
 */
@Schema({ timestamps: true, collection: 'referee_stats' })
@ObjectType()
export class RefereeStats {
  @Field(() => ID)
  _id: string

  // API-Football referee ID
  @Prop({ required: true, unique: true })
  @Field(() => Int)
  refereeId: number

  @Prop({ required: true })
  @Field()
  name: string

  @Prop()
  @Field({ nullable: true })
  nationality?: string

  // Career statistics
  @Prop({ default: 0 })
  @Field(() => Int)
  totalMatches: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgYellowCardsPerMatch: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgRedCardsPerMatch: number

  @Prop({ default: 0 })
  @Field(() => Float)
  avgTotalCardsPerMatch: number

  // Season statistics (current season)
  @Prop({ default: 0 })
  @Field(() => Int)
  seasonMatches: number

  @Prop({ default: 0 })
  @Field(() => Float)
  seasonAvgYellowCards: number

  @Prop({ default: 0 })
  @Field(() => Float)
  seasonAvgRedCards: number

  @Prop({ default: 0 })
  @Field(() => Float)
  seasonAvgTotalCards: number

  // Card style classification
  // STRICT: >4.5 cards/match, MODERATE: 3.5-4.5, LENIENT: <3.5
  @Prop({ enum: ['STRICT', 'MODERATE', 'LENIENT'], default: 'MODERATE' })
  @Field()
  cardStyle: string

  // League-specific averages (some refs are stricter in certain leagues)
  @Prop({ type: Map, of: Number })
  @Field(() => String, { nullable: true, description: 'JSON map of leagueId -> avgCards' })
  leagueAvgCards?: Map<number, number>

  // First half card percentage (some refs front-load cards)
  @Prop({ default: 0.38 })
  @Field(() => Float)
  firstHalfCardPct: number

  // Last updated
  @Prop()
  @Field({ nullable: true })
  lastUpdated?: Date

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const RefereeStatsSchema = SchemaFactory.createForClass(RefereeStats)

// Indexes
RefereeStatsSchema.index({ refereeId: 1 }, { unique: true })
RefereeStatsSchema.index({ name: 1 })
RefereeStatsSchema.index({ cardStyle: 1 })

/**
 * Referee data for cards scoring
 * Used as parameter to scoreCards when referee is known
 */
export interface RefereeDataForScoring {
  refereeId: number
  name: string
  avgCardsPerMatch: number
  cardStyle: 'STRICT' | 'MODERATE' | 'LENIENT'
  firstHalfCardPct: number
  seasonMatches: number
}
