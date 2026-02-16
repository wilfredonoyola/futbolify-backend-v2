import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID, Float } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'
import { FhgTier } from '../enums/fhg-tier.enum'

export type FhgLeagueDocument = FhgLeague & Document

/**
 * FHG League Schema
 * League configuration with tier classification and G1H profile
 */
@Schema({ timestamps: true, collection: 'fhg_leagues' })
@ObjectType()
export class FhgLeague extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ required: true, unique: true })
  @Field()
  code: string

  @Prop({ required: true })
  @Field()
  name: string

  @Prop({ type: String, enum: FhgTier, required: true })
  @Field(() => FhgTier)
  tier: FhgTier

  @Prop({ required: true })
  @Field(() => Float)
  avgG1H: number

  @Prop()
  @Field({ nullable: true })
  apiFootballId?: number

  @Prop()
  @Field({ nullable: true })
  footballDataCode?: string

  @Prop({ default: true })
  @Field()
  active: boolean

  @Prop()
  @Field({ nullable: true })
  flag?: string

  // G1H Profile - Updated periodically from real data
  @Prop()
  @Field(() => Float, { nullable: true })
  g1hRateHome?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  g1hRateAway?: number

  @Prop()
  @Field(() => Float, { nullable: true })
  avgMinuteFirstGoal?: number

  @Prop()
  @Field({ nullable: true })
  lastStatsUpdate?: Date

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const FhgLeagueSchema = SchemaFactory.createForClass(FhgLeague)
