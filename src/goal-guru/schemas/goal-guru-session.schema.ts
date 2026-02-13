import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Field, ObjectType, ID } from '@nestjs/graphql'
import { Document, Types } from 'mongoose'

export type GoalGuruSessionDocument = GoalGuruSession & Document

@Schema({ timestamps: true })
@ObjectType()
export class GoalGuruSession extends Document {
  @Field(() => ID)
  _id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: Types.ObjectId

  @Prop({ required: true })
  @Field()
  leagueId: string

  @Prop({ required: true })
  @Field()
  leagueName: string

  @Prop({ type: Object })
  @Field(() => String, { nullable: true })
  matches?: any

  @Prop({ type: Object })
  @Field(() => String, { nullable: true })
  contexts?: any

  @Prop({ type: Object })
  @Field(() => String, { nullable: true })
  analysis?: any

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const GoalGuruSessionSchema =
  SchemaFactory.createForClass(GoalGuruSession)
