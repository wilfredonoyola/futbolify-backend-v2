// DTOs for World Cup Chat GraphQL API

import { Field, InputType, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

// Input message
@InputType()
export class ChatMessageInput {
  @Field()
  role: 'user' | 'assistant';

  @Field()
  content: string;
}

// Chat request input
@InputType()
export class WorldcupChatInput {
  @Field(() => [ChatMessageInput])
  messages: ChatMessageInput[];

  @Field({ defaultValue: 'es' })
  locale: string;

  @Field({ defaultValue: 'America/New_York' })
  timezone: string;

  @Field(() => [String], { nullable: true })
  favoriteTeams?: string[];

  @Field({ nullable: true })
  sessionId?: string;

  @Field({ nullable: true, description: 'Anonymous creator ID for quiniela creation (passed from frontend localStorage)' })
  anonymousCreatorId?: string;
}

// Data item in response
@ObjectType()
export class ChatDataItem {
  @Field()
  type: string;

  @Field(() => GraphQLJSON)
  data: Record<string, unknown>;
}

// Data payload in response
@ObjectType()
export class ChatDataPayload {
  @Field()
  type: string;

  @Field(() => [ChatDataItem])
  items: ChatDataItem[];
}

// Action artifact
@ObjectType()
export class ActionArtifact {
  @Field()
  type: string;

  @Field({ nullable: true })
  filename?: string;

  @Field({ nullable: true })
  mimeType?: string;

  @Field({ nullable: true })
  data?: string;

  @Field({ nullable: true })
  embedType?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  embedData?: Record<string, unknown>;
}

// Action result
@ObjectType()
export class ActionResult {
  @Field()
  success: boolean;

  @Field()
  actionType: string;

  @Field(() => ActionArtifact, { nullable: true })
  artifact?: ActionArtifact;

  @Field({ nullable: true })
  error?: string;
}

// Warning info
@ObjectType()
export class ChatWarning {
  @Field()
  level: number;

  @Field()
  message: string;
}

// Chat response
@ObjectType()
export class WorldcupChatResponse {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field(() => ChatDataPayload, { nullable: true })
  data?: ChatDataPayload;

  @Field(() => ActionResult, { nullable: true })
  action?: ActionResult;

  @Field({ nullable: true })
  error?: string;

  @Field({ nullable: true })
  sessionId?: string;

  @Field({ nullable: true })
  messageCount?: number;

  @Field({ nullable: true })
  messageLimit?: number;

  @Field({ nullable: true })
  messagesRemaining?: number;

  @Field({ nullable: true })
  isAtLimit?: boolean;

  @Field(() => ChatWarning, { nullable: true })
  warning?: ChatWarning;
}

// Message limit error response
@ObjectType()
export class MessageLimitError {
  @Field()
  code: string;

  @Field()
  message: string;

  @Field()
  messageCount: number;

  @Field()
  limit: number;
}
