// GraphQL Resolver for Football Chat

import { Resolver, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FootballChatService, FootballChatInput } from './football-chat.service';
import {
  FootballChatInputDto,
  FootballChatResponseDto,
} from './dto/football-chat.dto';

@Resolver()
export class FootballChatResolver {
  constructor(private readonly footballChatService: FootballChatService) {}

  @Mutation(() => FootballChatResponseDto)
  async footballChat(
    @Args('input') input: FootballChatInputDto,
    @Context() context: any,
  ): Promise<FootballChatResponseDto> {
    // Extract user ID from context if authenticated
    const userId = context.req?.user?.id || null;

    const chatInput: FootballChatInput = {
      messages: input.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      locale: input.locale,
      timezone: input.timezone,
      leagueId: input.leagueId,
      teamId: input.teamId,
      matchId: input.matchId,
      favoriteTeams: input.favoriteTeams,
      sessionId: input.sessionId,
      userId,
      anonymousCreatorId: input.anonymousCreatorId,
    };

    const response = await this.footballChatService.chat(chatInput);

    // Map internal response to GraphQL response format
    // ChatDataPayload from worldcup uses items: [{ type, data }]
    return {
      success: response.success,
      message: response.message,
      data: response.data
        ? {
            type: response.data.type,
            items: response.data.items.map((item) => ({
              type: item.type,
              data: item.data as Record<string, unknown>,
            })),
          }
        : undefined,
      action: response.action
        ? {
            actionType: response.action.actionType,
            success: response.action.success,
            artifact: response.action.artifact
              ? {
                  type: response.action.artifact.type,
                  embedData: response.action.artifact.data as Record<string, unknown>,
                }
              : undefined,
            error: response.action.error,
          }
        : undefined,
      suggestions: response.suggestions,
      sessionId: response.sessionId,
      messageCount: response.messageCount,
      messageLimit: response.messageLimit,
      messagesRemaining: response.messagesRemaining,
      isAtLimit: response.isAtLimit,
      warning: response.warning,
      error: response.error,
    };
  }
}
