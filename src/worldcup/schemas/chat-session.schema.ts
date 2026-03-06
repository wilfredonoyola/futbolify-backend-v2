// MongoDB Schema for Chat Session persistence

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ID, ObjectType, InputType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

// Embedded message type
@ObjectType()
export class StoredMessage {
  @Field()
  role: 'user' | 'assistant';

  @Field()
  content: string;

  @Field(() => Date)
  timestamp: Date;

  @Field(() => GraphQLJSON, { nullable: true })
  data?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  action?: Record<string, unknown>;
}

@Schema({ timestamps: true, collection: 'chat_sessions' })
@ObjectType()
export class ChatSession {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  @Field(() => ID, { nullable: true })
  userId?: Types.ObjectId;

  @Prop({ required: true, unique: true })
  @Field()
  sessionId: string;

  @Prop({ type: [Object], default: [] })
  @Field(() => [StoredMessage])
  messages: StoredMessage[];

  @Prop({ default: 0 })
  @Field()
  messageCount: number;

  @Prop()
  @Field({ nullable: true })
  locale?: string;

  @Prop()
  @Field({ nullable: true })
  timezone?: string;

  @Prop({ type: [String], default: [] })
  @Field(() => [String])
  favoriteTeams: string[];

  @Prop()
  @Field(() => Date, { nullable: true })
  lastMessageAt?: Date;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}

export type ChatSessionDocument = ChatSession & Document;

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// Indexes for performance
ChatSessionSchema.index({ sessionId: 1 }, { unique: true });
ChatSessionSchema.index({ userId: 1 });
ChatSessionSchema.index({ lastMessageAt: -1 });
ChatSessionSchema.index({ createdAt: -1 });

// TTL index - delete sessions older than 30 days for anonymous users
ChatSessionSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { userId: { $exists: false } }
  }
);
