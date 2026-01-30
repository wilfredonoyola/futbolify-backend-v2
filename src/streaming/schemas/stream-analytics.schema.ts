import { Field, ObjectType, ID, Int } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type StreamAnalyticsDocument = StreamAnalytics & Document

@Schema({ timestamps: true })
@ObjectType()
export class StreamAnalytics {
  @Field(() => ID)
  id: string

  @Prop({ type: Types.ObjectId, ref: 'Stream', required: true, unique: true })
  @Field(() => ID)
  streamId: Types.ObjectId

  @Prop({ default: 0 })
  @Field(() => Int)
  peakViewers: number

  @Prop({ default: 0 })
  @Field(() => Int)
  totalViews: number

  @Prop({ default: 0 })
  @Field(() => Int)
  uniqueViewers: number

  @Prop({ default: 0 })
  @Field(() => Int)
  totalMessages: number

  @Prop({ default: 0 })
  @Field(() => Int)
  durationSeconds: number

  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  uniqueViewerIds: string[]

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const StreamAnalyticsSchema = SchemaFactory.createForClass(StreamAnalytics)

// streamId index already created by unique: true constraint
