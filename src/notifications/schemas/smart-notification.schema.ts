import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { SmartNotificationType, NotificationChannel } from './notification-preferences.schema'

export type SmartNotificationDocument = SmartNotification & Document

// Delivery status for each channel
export enum DeliveryStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED', // User has this channel disabled
}

registerEnumType(DeliveryStatus, {
  name: 'DeliveryStatus',
  description: 'Status of notification delivery per channel',
})

// Channel delivery tracking
@Schema({ _id: false })
@ObjectType()
export class ChannelDelivery {
  @Prop({ type: String, enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  @Field(() => DeliveryStatus)
  status: DeliveryStatus

  @Prop({ required: false })
  @Field({ nullable: true })
  sentAt?: Date

  @Prop({ required: false })
  @Field({ nullable: true })
  error?: string

  @Prop({ required: false })
  @Field({ nullable: true })
  externalId?: string // FCM message ID, Telegram message ID, etc.
}

export const ChannelDeliverySchema = SchemaFactory.createForClass(ChannelDelivery)

// Match context for match-related notifications
@Schema({ _id: false })
@ObjectType()
export class MatchContext {
  @Prop({ required: true })
  @Field()
  matchId: string

  @Prop({ required: true })
  @Field()
  homeTeamCode: string

  @Prop({ required: true })
  @Field()
  awayTeamCode: string

  @Prop({ required: true })
  @Field()
  homeTeamName: string

  @Prop({ required: true })
  @Field()
  awayTeamName: string

  @Prop({ required: false })
  @Field({ nullable: true })
  homeScore?: number

  @Prop({ required: false })
  @Field({ nullable: true })
  awayScore?: number

  @Prop({ required: true })
  @Field()
  matchDateUTC: Date

  @Prop({ required: false })
  @Field({ nullable: true })
  stage?: string // "Group A", "Round of 16", etc.

  @Prop({ required: false })
  @Field({ nullable: true })
  venue?: string
}

export const MatchContextSchema = SchemaFactory.createForClass(MatchContext)

// Quiniela context
@Schema({ _id: false })
@ObjectType()
export class QuinielaContext {
  @Prop({ required: true })
  @Field()
  quinielaId: string

  @Prop({ required: true })
  @Field()
  quinielaName: string

  @Prop({ required: false })
  @Field({ nullable: true })
  quinielaCode?: string

  @Prop({ required: false })
  @Field({ nullable: true })
  userRank?: number

  @Prop({ required: false })
  @Field({ nullable: true })
  userPoints?: number

  @Prop({ required: false })
  @Field({ nullable: true })
  previousRank?: number
}

export const QuinielaContextSchema = SchemaFactory.createForClass(QuinielaContext)

// AI context
@Schema({ _id: false })
@ObjectType()
export class AIContext {
  @Prop({ required: false })
  @Field({ nullable: true })
  aiPrediction?: string // "2-1"

  @Prop({ required: false })
  @Field({ nullable: true })
  userPrediction?: string // "1-1"

  @Prop({ required: false })
  @Field({ nullable: true })
  aiConfidence?: number

  @Prop({ required: false })
  @Field({ nullable: true })
  aiReasoning?: string

  @Prop({ required: false })
  @Field({ nullable: true })
  userScore?: number // AI vs You score

  @Prop({ required: false })
  @Field({ nullable: true })
  aiScore?: number
}

export const AIContextSchema = SchemaFactory.createForClass(AIContext)

// Main Smart Notification schema
@Schema({ timestamps: true })
@ObjectType()
export class SmartNotification extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  @Field(() => ID)
  userId: Types.ObjectId

  @Prop({ type: String, enum: SmartNotificationType, required: true, index: true })
  @Field(() => SmartNotificationType)
  type: SmartNotificationType

  // Content
  @Prop({ required: true })
  @Field()
  title: string

  @Prop({ required: true })
  @Field()
  message: string

  @Prop({ required: false })
  @Field({ nullable: true })
  shortMessage?: string // For push notifications (limited chars)

  @Prop({ required: false })
  @Field({ nullable: true })
  imageUrl?: string

  @Prop({ required: false })
  @Field({ nullable: true })
  actionUrl?: string // Deep link URL

  // Delivery tracking per channel
  @Prop({ type: ChannelDeliverySchema, default: () => ({ status: DeliveryStatus.PENDING }) })
  @Field(() => ChannelDelivery)
  pushDelivery: ChannelDelivery

  @Prop({ type: ChannelDeliverySchema, default: () => ({ status: DeliveryStatus.PENDING }) })
  @Field(() => ChannelDelivery)
  telegramDelivery: ChannelDelivery

  @Prop({ type: ChannelDeliverySchema, default: () => ({ status: DeliveryStatus.PENDING }) })
  @Field(() => ChannelDelivery)
  emailDelivery: ChannelDelivery

  @Prop({ type: ChannelDeliverySchema, default: () => ({ status: DeliveryStatus.PENDING }) })
  @Field(() => ChannelDelivery)
  inAppDelivery: ChannelDelivery

  // Context data (depends on notification type)
  @Prop({ type: MatchContextSchema, required: false })
  @Field(() => MatchContext, { nullable: true })
  matchContext?: MatchContext

  @Prop({ type: QuinielaContextSchema, required: false })
  @Field(() => QuinielaContext, { nullable: true })
  quinielaContext?: QuinielaContext

  @Prop({ type: AIContextSchema, required: false })
  @Field(() => AIContext, { nullable: true })
  aiContext?: AIContext

  // User interaction
  @Prop({ default: false })
  @Field()
  isRead: boolean

  @Prop({ required: false })
  @Field({ nullable: true })
  readAt?: Date

  @Prop({ required: false })
  @Field({ nullable: true })
  clickedAt?: Date

  // Scheduling
  @Prop({ required: false, index: true })
  @Field({ nullable: true })
  scheduledFor?: Date // For scheduled notifications (morning briefing, pre-match)

  @Prop({ default: false })
  @Field()
  isProcessed: boolean // Has been picked up by workers

  // Priority (for queue ordering)
  @Prop({ default: 5 })
  @Field()
  priority: number // 1 = highest, 10 = lowest

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date
}

export const SmartNotificationSchema = SchemaFactory.createForClass(SmartNotification)

// Indexes for efficient queries
SmartNotificationSchema.index({ userId: 1, createdAt: -1 })
SmartNotificationSchema.index({ userId: 1, isRead: 1 })
SmartNotificationSchema.index({ type: 1, scheduledFor: 1, isProcessed: 1 })
SmartNotificationSchema.index({ createdAt: -1 })
SmartNotificationSchema.index({ 'matchContext.matchId': 1 })
SmartNotificationSchema.index({ 'quinielaContext.quinielaId': 1 })
