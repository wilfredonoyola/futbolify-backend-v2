import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'
import { FhgLogLevel } from '../enums/fhg-log-level.enum'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'
import GraphQLJSON from 'graphql-type-json'

export type FhgLogDocument = FhgLog & Document

/**
 * FHG Log Schema
 * Logs for transparency and debugging - visible in frontend
 */
@Schema({ timestamps: true, collection: 'fhg_logs' })
@ObjectType()
export class FhgLog extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ type: String, enum: FhgLogLevel, required: true })
  @Field(() => FhgLogLevel)
  level: FhgLogLevel

  @Prop({ type: String, enum: FhgLogCategory, required: true })
  @Field(() => FhgLogCategory)
  category: FhgLogCategory

  @Prop({ required: true })
  @Field()
  message: string

  @Prop({ type: Object })
  @Field(() => GraphQLJSON, { nullable: true })
  data?: Record<string, unknown>

  // Context info
  @Prop()
  @Field({ nullable: true })
  matchId?: string

  @Prop()
  @Field({ nullable: true })
  pipelineId?: string

  @Prop()
  @Field({ nullable: true })
  selectionId?: string

  @Prop({ required: true })
  @Field()
  timestamp: Date

  @Field()
  createdAt: Date
}

export const FhgLogSchema = SchemaFactory.createForClass(FhgLog)

// Index for efficient querying
FhgLogSchema.index({ timestamp: -1 })
FhgLogSchema.index({ category: 1, timestamp: -1 })
FhgLogSchema.index({ level: 1, timestamp: -1 })

// TTL index - auto-delete logs older than 30 days
FhgLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })
