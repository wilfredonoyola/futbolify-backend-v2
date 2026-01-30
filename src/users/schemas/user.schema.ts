/** @format */

import { registerEnumType, Field, ObjectType, ID, Int } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type UserDocument = User & Document

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

// Register the enum with GraphQL
registerEnumType(UserRole, {
  name: 'UserRole',
  description: 'The roles a user can have in the system',
})

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class User extends Document {
  @Field(() => ID)
  get userId(): string {
    return this._id.toString()
  }

  @Prop({ required: true, unique: true })
  @Field()
  email: string

  @Prop({ required: false })
  @Field({ nullable: true })
  birthday?: Date

  @Prop({ required: false })
  @Field()
  phone: string

  @Prop({ type: [String], enum: UserRole, default: [UserRole.USER] })
  @Field(() => [UserRole])
  roles: UserRole[]

  @Prop({ required: false, default: false })
  @Field(() => Boolean, { defaultValue: false })
  isOnboardingCompleted?: boolean

  @Prop()
  @Field(() => Int)
  createdAt: number

  @Prop()
  @Field(() => Int)
  updatedAt: number

  @Prop({ required: true, unique: true })
  @Field()
  userName: string

  @Prop({ required: false })
  @Field({ nullable: true })
  name?: string

  @Prop({ required: false })
  @Field({ nullable: true })
  avatarUrl?: string

  @Prop({ required: false, unique: true })
  @Field({ nullable: true })
  googleId?: string

  @Prop({ required: false })
  @Field({ nullable: true })
  authProvider?: string

  @Prop({ default: false })
  isProfileCompleted: boolean

  @Prop({ required: false })
  password?: string

  @Prop({ type: Types.ObjectId, ref: 'Brand', required: false })
  @Field(() => ID, { nullable: true })
  activeBrandId?: Types.ObjectId

  // Streaming-related fields
  @Prop({ type: String, enum: ['free', 'pro'], default: 'free' })
  @Field({ nullable: true })
  plan?: string

  @Prop({ default: 0 })
  @Field(() => Int, { defaultValue: 0 })
  streamsThisMonth?: number

  @Prop({ unique: true, sparse: true })
  streamKey?: string // Not exposed via GraphQL for security

  @Prop()
  @Field({ nullable: true })
  stripeCustomerId?: string
}

export const UserSchema = SchemaFactory.createForClass(User)
