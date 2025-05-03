import { Field, Float, Int, ObjectType, ID } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type PredictionRecordDocument = PredictionRecord & Document

@Schema({ timestamps: true })
@ObjectType()
export class PredictionRecord {
  @Field(() => ID)
  id: string

  @Prop({ required: true })
  @Field(() => Int)
  matchId: number

  @Prop({ required: true })
  @Field(() => Int)
  minute: number

  @Prop({ required: true })
  @Field(() => Int)
  scoreHome: number

  @Prop({ required: true })
  @Field(() => Int)
  scoreAway: number

  @Prop({ required: true })
  @Field(() => Float)
  pressureScore: number

  @Prop({ required: true })
  @Field(() => Float)
  recentActivityScore: number

  @Prop({ required: true })
  @Field(() => Float)
  liveProbability: number

  @Prop({ required: true })
  @Field(() => Float)
  finalProbability: number

  @Prop()
  @Field({ nullable: true })
  historicalComment?: string

  @Prop({ default: false })
  @Field(() => Boolean)
  goalOccurred: boolean

  @Prop()
  @Field(() => Date)
  createdAt: Date

  @Prop()
  @Field(() => Date)
  updatedAt: Date
}

export const PredictionRecordSchema =
  SchemaFactory.createForClass(PredictionRecord)
