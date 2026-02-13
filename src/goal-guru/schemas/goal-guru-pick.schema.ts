import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID, Float, Int, registerEnumType } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'
import { RiskLevel } from '../enums/risk-level.enum'

export enum PickResult {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
}

registerEnumType(PickResult, {
  name: 'PickResult',
  description: 'Result status of a Goal Guru pick',
})

export type GoalGuruPickDocument = GoalGuruPick & Document

@Schema({ timestamps: true })
@ObjectType()
export class GoalGuruPick extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'GoalGuruSession', nullable: true })
  @Field(() => ID, { nullable: true })
  sessionId?: Types.ObjectId

  @Prop({ required: true })
  @Field()
  match: string

  @Prop({ required: true })
  @Field()
  mercado: string

  @Prop({ required: true })
  @Field(() => Float)
  odds: number

  @Prop({ required: true })
  @Field(() => Int)
  confianza: number

  @Prop({ required: true })
  @Field(() => Int)
  stake: number

  @Prop({ type: String, enum: RiskLevel, required: true })
  @Field(() => RiskLevel)
  riesgo: RiskLevel

  @Prop({ type: String, enum: PickResult, default: PickResult.PENDING })
  @Field(() => PickResult)
  result: PickResult

  @Prop({ default: 0 })
  @Field(() => Float)
  profit: number

  @Prop({ required: true })
  @Field()
  league: string

  @Prop({ nullable: true })
  @Field({ nullable: true })
  resolvedAt?: Date

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const GoalGuruPickSchema = SchemaFactory.createForClass(GoalGuruPick)
