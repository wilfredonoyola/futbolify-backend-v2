import { Field, ObjectType, ID, Int, registerEnumType } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export enum StreamStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  ENDED = 'ENDED',
}

export enum StreamSport {
  SOCCER = 'SOCCER',
  BASKETBALL = 'BASKETBALL',
  TENNIS = 'TENNIS',
  BASEBALL = 'BASEBALL',
  HOCKEY = 'HOCKEY',
  FOOTBALL = 'FOOTBALL',
  OTHER = 'OTHER',
}

registerEnumType(StreamStatus, {
  name: 'StreamStatus',
  description: 'The status of a stream',
})

registerEnumType(StreamSport, {
  name: 'StreamSport',
  description: 'The sport type for a stream',
})

export type StreamDocument = Stream & Document

@Schema({ timestamps: true })
@ObjectType()
export class Stream {
  @Field(() => ID)
  id: string

  @Prop({ required: true })
  @Field()
  title: string

  @Prop()
  @Field({ nullable: true })
  description?: string

  @Prop({ type: String, enum: StreamSport, default: StreamSport.SOCCER })
  @Field(() => StreamSport)
  sport: StreamSport

  @Prop({ type: String, enum: StreamStatus, default: StreamStatus.SCHEDULED })
  @Field(() => StreamStatus)
  status: StreamStatus

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: Types.ObjectId

  @Prop({ unique: true, sparse: true })
  streamKey?: string

  @Prop()
  @Field({ nullable: true })
  rtmpUrl?: string

  @Prop()
  @Field({ nullable: true })
  hlsUrl?: string

  @Prop({ default: 0 })
  @Field(() => Int)
  viewerCount: number

  @Prop()
  @Field({ nullable: true })
  homeTeam?: string

  @Prop()
  @Field({ nullable: true })
  awayTeam?: string

  @Prop({ default: 0 })
  @Field(() => Int)
  homeScore: number

  @Prop({ default: 0 })
  @Field(() => Int)
  awayScore: number

  @Prop()
  @Field({ nullable: true })
  thumbnailUrl?: string

  @Prop()
  @Field({ nullable: true })
  startedAt?: Date

  @Prop()
  @Field({ nullable: true })
  endedAt?: Date

  @Prop()
  @Field({ nullable: true })
  scheduledAt?: Date

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const StreamSchema = SchemaFactory.createForClass(Stream)

StreamSchema.index({ userId: 1 })
StreamSchema.index({ status: 1 })
// streamKey index already created by unique: true constraint
StreamSchema.index({ sport: 1, status: 1 })
