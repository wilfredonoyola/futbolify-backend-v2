import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export enum SubscriptionPlan {
  FREE = 'FREE',
  PRO = 'PRO',
  PREMIUM = 'PREMIUM',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELED = 'CANCELED',
  PAST_DUE = 'PAST_DUE',
  TRIALING = 'TRIALING',
}

registerEnumType(SubscriptionPlan, {
  name: 'SubscriptionPlan',
  description: 'Subscription plan types',
})

registerEnumType(SubscriptionStatus, {
  name: 'SubscriptionStatus',
  description: 'Subscription status types',
})

export type UserSubscriptionDocument = UserSubscription & Document

@Schema({ timestamps: true })
@ObjectType()
export class UserSubscription {
  @Field(() => ID)
  id: string

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  @Field(() => ID)
  userId: Types.ObjectId

  @Prop({ type: String, enum: SubscriptionPlan, default: SubscriptionPlan.FREE })
  @Field(() => SubscriptionPlan)
  plan: SubscriptionPlan

  @Prop({ type: String, enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  @Field(() => SubscriptionStatus)
  status: SubscriptionStatus

  @Prop()
  @Field({ nullable: true })
  stripeCustomerId?: string

  @Prop()
  @Field({ nullable: true })
  stripeSubscriptionId?: string

  @Prop()
  @Field({ nullable: true })
  currentPeriodEnd?: Date

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const UserSubscriptionSchema = SchemaFactory.createForClass(UserSubscription)

UserSubscriptionSchema.index({ userId: 1 })
UserSubscriptionSchema.index({ stripeCustomerId: 1 })
