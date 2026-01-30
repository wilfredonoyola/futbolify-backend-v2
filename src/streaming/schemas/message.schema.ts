import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export enum MessageType {
  TEXT = 'TEXT',
  EMOJI = 'EMOJI',
  SYSTEM = 'SYSTEM',
}

registerEnumType(MessageType, {
  name: 'MessageType',
  description: 'The type of chat message',
})

export type MessageDocument = Message & Document

@Schema({ timestamps: true })
@ObjectType()
export class Message {
  @Field(() => ID)
  id: string

  @Prop({ type: Types.ObjectId, ref: 'Stream', required: true })
  @Field(() => ID)
  streamId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: Types.ObjectId

  @Prop({ required: true })
  @Field()
  userName: string

  @Prop({ required: true })
  @Field()
  content: string

  @Prop({ type: String, enum: MessageType, default: MessageType.TEXT })
  @Field(() => MessageType)
  type: MessageType

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

export const MessageSchema = SchemaFactory.createForClass(Message)

MessageSchema.index({ streamId: 1, createdAt: -1 })
