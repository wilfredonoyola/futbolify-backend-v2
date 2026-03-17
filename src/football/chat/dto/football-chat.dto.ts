// DTOs for Football Chat GraphQL
// Reuses common types from worldcup chat

import { Field, InputType, ObjectType, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import {
  ChatMessageInput,
  ChatDataPayload,
  ActionResult,
  ChatWarning,
} from '../../../worldcup/dto/chat.dto';

// Re-export for convenience
export { ChatMessageInput, ChatDataPayload, ActionResult, ChatWarning };

@InputType()
export class FootballChatInputDto {
  @Field(() => [ChatMessageInput])
  messages: ChatMessageInput[];

  @Field()
  locale: string;

  @Field()
  timezone: string;

  @Field({ nullable: true })
  leagueId?: string;

  @Field({ nullable: true })
  teamId?: string;

  @Field({ nullable: true })
  matchId?: string;

  @Field(() => [String], { nullable: true })
  favoriteTeams?: string[];

  @Field({ nullable: true })
  sessionId?: string;

  @Field({ nullable: true })
  anonymousCreatorId?: string;
}

@ObjectType()
export class FootballChatResponseDto {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field(() => ChatDataPayload, { nullable: true })
  data?: ChatDataPayload;

  @Field(() => ActionResult, { nullable: true })
  action?: ActionResult;

  @Field(() => [String], { nullable: true })
  suggestions?: string[];

  @Field({ nullable: true })
  sessionId?: string;

  @Field(() => Int, { nullable: true })
  messageCount?: number;

  @Field(() => Int, { nullable: true })
  messageLimit?: number;

  @Field(() => Int, { nullable: true })
  messagesRemaining?: number;

  @Field({ nullable: true })
  isAtLimit?: boolean;

  @Field(() => ChatWarning, { nullable: true })
  warning?: ChatWarning;

  @Field({ nullable: true })
  error?: string;
}
