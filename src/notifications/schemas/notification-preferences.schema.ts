import { Field, ObjectType, ID, InputType, registerEnumType } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type NotificationPreferencesDocument = NotificationPreferences & Document

// Notification channels
export enum NotificationChannel {
  PUSH = 'PUSH',           // FCM push notifications (web + mobile)
  TELEGRAM = 'TELEGRAM',   // Telegram bot messages
  EMAIL = 'EMAIL',         // Email notifications
  IN_APP = 'IN_APP',       // In-app real-time (GraphQL subscription)
}

registerEnumType(NotificationChannel, {
  name: 'NotificationChannel',
  description: 'Available notification channels',
})

// Intelligent notification types for World Cup / Quiniela
export enum SmartNotificationType {
  // Match-related
  MORNING_BRIEFING = 'MORNING_BRIEFING',       // Daily matches summary (8am)
  PRE_MATCH_REMINDER = 'PRE_MATCH_REMINDER',   // 2h before match starts
  POST_MATCH_RESULT = 'POST_MATCH_RESULT',     // Final score + your points
  LIVE_GOAL = 'LIVE_GOAL',                     // Real-time goal alerts

  // Quiniela-related
  RANKING_UPDATE = 'RANKING_UPDATE',           // Someone passed you in ranking
  PREDICTION_DEADLINE = 'PREDICTION_DEADLINE', // 30min to submit prediction
  QUINIELA_INVITE = 'QUINIELA_INVITE',         // Someone invited you

  // AI-related
  AI_INSIGHT = 'AI_INSIGHT',                   // AI prediction tip
  AI_VS_YOU_UPDATE = 'AI_VS_YOU_UPDATE',       // AI score comparison

  // Social
  FRIEND_JOINED = 'FRIEND_JOINED',             // Friend joined your quiniela
  ACHIEVEMENT = 'ACHIEVEMENT',                 // You earned a badge
}

registerEnumType(SmartNotificationType, {
  name: 'SmartNotificationType',
  description: 'Types of smart notifications',
})

// Email frequency
export enum EmailFrequency {
  REALTIME = 'REALTIME',   // Send immediately
  DAILY = 'DAILY',         // Daily digest
  WEEKLY = 'WEEKLY',       // Weekly recap
  NEVER = 'NEVER',         // Don't send emails
}

registerEnumType(EmailFrequency, {
  name: 'EmailFrequency',
  description: 'Email notification frequency',
})

// Quiet hours configuration
@Schema({ _id: false })
@ObjectType()
export class QuietHours {
  @Prop({ default: false })
  @Field()
  enabled: boolean

  @Prop({ default: '23:00' })
  @Field()
  start: string // HH:mm format

  @Prop({ default: '07:00' })
  @Field()
  end: string // HH:mm format
}

export const QuietHoursSchema = SchemaFactory.createForClass(QuietHours)

// Channel-specific settings
@Schema({ _id: false })
@ObjectType()
export class ChannelSettings {
  @Prop({ default: true })
  @Field()
  enabled: boolean

  @Prop({ type: QuietHoursSchema, default: () => ({}) })
  @Field(() => QuietHours, { nullable: true })
  quietHours?: QuietHours
}

export const ChannelSettingsSchema = SchemaFactory.createForClass(ChannelSettings)

// Email channel settings (extends ChannelSettings)
@Schema({ _id: false })
@ObjectType()
export class EmailChannelSettings extends ChannelSettings {
  @Prop({ type: String, enum: EmailFrequency, default: EmailFrequency.DAILY })
  @Field(() => EmailFrequency)
  frequency: EmailFrequency
}

export const EmailChannelSettingsSchema = SchemaFactory.createForClass(EmailChannelSettings)

// Type preferences (which types go to which channels)
@Schema({ _id: false })
@ObjectType()
export class TypeChannelPreference {
  @Prop({ default: true })
  @Field()
  push: boolean

  @Prop({ default: true })
  @Field()
  telegram: boolean

  @Prop({ default: false })
  @Field()
  email: boolean

  @Prop({ default: true })
  @Field()
  inApp: boolean
}

export const TypeChannelPreferenceSchema = SchemaFactory.createForClass(TypeChannelPreference)

// Main preferences schema
@Schema({ timestamps: true })
@ObjectType()
export class NotificationPreferences extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  @Field(() => ID)
  userId: Types.ObjectId

  // Channel settings
  @Prop({ type: ChannelSettingsSchema, default: () => ({ enabled: true }) })
  @Field(() => ChannelSettings)
  push: ChannelSettings

  @Prop({ type: ChannelSettingsSchema, default: () => ({ enabled: true }) })
  @Field(() => ChannelSettings)
  telegram: ChannelSettings

  @Prop({ type: EmailChannelSettingsSchema, default: () => ({ enabled: false, frequency: EmailFrequency.DAILY }) })
  @Field(() => EmailChannelSettings)
  email: EmailChannelSettings

  // Type preferences - which notification types go to which channels
  @Prop({ type: TypeChannelPreferenceSchema, default: () => ({ push: true, telegram: true, email: false, inApp: true }) })
  @Field(() => TypeChannelPreference)
  morningBriefing: TypeChannelPreference

  @Prop({ type: TypeChannelPreferenceSchema, default: () => ({ push: true, telegram: true, email: false, inApp: true }) })
  @Field(() => TypeChannelPreference)
  preMatchReminder: TypeChannelPreference

  @Prop({ type: TypeChannelPreferenceSchema, default: () => ({ push: true, telegram: false, email: false, inApp: true }) })
  @Field(() => TypeChannelPreference)
  postMatchResult: TypeChannelPreference

  @Prop({ type: TypeChannelPreferenceSchema, default: () => ({ push: true, telegram: false, email: false, inApp: true }) })
  @Field(() => TypeChannelPreference)
  rankingUpdate: TypeChannelPreference

  @Prop({ type: TypeChannelPreferenceSchema, default: () => ({ push: true, telegram: true, email: false, inApp: true }) })
  @Field(() => TypeChannelPreference)
  predictionDeadline: TypeChannelPreference

  @Prop({ type: TypeChannelPreferenceSchema, default: () => ({ push: false, telegram: true, email: false, inApp: true }) })
  @Field(() => TypeChannelPreference)
  aiInsight: TypeChannelPreference

  @Prop({ type: TypeChannelPreferenceSchema, default: () => ({ push: false, telegram: false, email: false, inApp: true }) })
  @Field(() => TypeChannelPreference)
  aiVsYouUpdate: TypeChannelPreference

  // Favorite teams (get extra notifications for these)
  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  favoriteTeams: string[] // Team codes: ["MEX", "ARG", "BRA"]

  // Timezone for scheduling
  @Prop({ default: 'America/Mexico_City' })
  @Field()
  timezone: string

  // Master switch
  @Prop({ default: true })
  @Field()
  globalEnabled: boolean

  @Field(() => Date)
  createdAt: Date

  @Field(() => Date)
  updatedAt: Date
}

export const NotificationPreferencesSchema = SchemaFactory.createForClass(NotificationPreferences)

// Input types for GraphQL mutations
@InputType()
export class QuietHoursInput {
  @Field()
  enabled: boolean

  @Field()
  start: string

  @Field()
  end: string
}

@InputType()
export class ChannelSettingsInput {
  @Field()
  enabled: boolean

  @Field(() => QuietHoursInput, { nullable: true })
  quietHours?: QuietHoursInput
}

@InputType()
export class EmailChannelSettingsInput extends ChannelSettingsInput {
  @Field(() => EmailFrequency)
  frequency: EmailFrequency
}

@InputType()
export class TypeChannelPreferenceInput {
  @Field()
  push: boolean

  @Field()
  telegram: boolean

  @Field()
  email: boolean

  @Field()
  inApp: boolean
}

@InputType()
export class UpdateNotificationPreferencesInput {
  @Field(() => ChannelSettingsInput, { nullable: true })
  push?: ChannelSettingsInput

  @Field(() => ChannelSettingsInput, { nullable: true })
  telegram?: ChannelSettingsInput

  @Field(() => EmailChannelSettingsInput, { nullable: true })
  email?: EmailChannelSettingsInput

  @Field(() => TypeChannelPreferenceInput, { nullable: true })
  morningBriefing?: TypeChannelPreferenceInput

  @Field(() => TypeChannelPreferenceInput, { nullable: true })
  preMatchReminder?: TypeChannelPreferenceInput

  @Field(() => TypeChannelPreferenceInput, { nullable: true })
  postMatchResult?: TypeChannelPreferenceInput

  @Field(() => TypeChannelPreferenceInput, { nullable: true })
  rankingUpdate?: TypeChannelPreferenceInput

  @Field(() => TypeChannelPreferenceInput, { nullable: true })
  predictionDeadline?: TypeChannelPreferenceInput

  @Field(() => TypeChannelPreferenceInput, { nullable: true })
  aiInsight?: TypeChannelPreferenceInput

  @Field(() => TypeChannelPreferenceInput, { nullable: true })
  aiVsYouUpdate?: TypeChannelPreferenceInput

  @Field(() => [String], { nullable: true })
  favoriteTeams?: string[]

  @Field({ nullable: true })
  timezone?: string

  @Field({ nullable: true })
  globalEnabled?: boolean
}
