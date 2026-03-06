// Chat Service - Main agentic loop for World Cup 2026 chat

import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

import { QueriesService } from '../queries/queries.service';
import { ChatSession, ChatSessionDocument, StoredMessage } from '../schemas/chat-session.schema';
import { WorldcupChatInput, WorldcupChatResponse, ChatDataPayload, ActionResult } from '../dto/chat.dto';
import { getSystemPrompt } from './system-prompt';
import { allWorldCupTools, ACTION_TOOL_NAMES } from './tools';
import { executeTool } from './tool-handlers';
import { executeAction } from './action-handlers';
import { ANONYMOUS_MESSAGE_LIMIT } from './constants';
import type { Locale, ChatDataPayload as TypeChatDataPayload, ActionResult as TypeActionResult, MatchData } from './types';

@Injectable()
export class ChatService {
  private anthropicClient: Anthropic | null = null;

  constructor(
    @InjectModel(ChatSession.name)
    private chatSessionModel: Model<ChatSessionDocument>,
    private readonly queriesService: QueriesService,
    private readonly configService: ConfigService,
  ) {}

  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      this.anthropicClient = new Anthropic({ apiKey });
    }
    return this.anthropicClient;
  }

  async getOrCreateSession(
    sessionId?: string,
    userId?: string,
    locale?: string,
    timezone?: string,
    favoriteTeams?: string[],
  ): Promise<ChatSessionDocument> {
    // Try to find existing session
    if (sessionId) {
      const existingSession = await this.chatSessionModel.findOne({ sessionId });
      if (existingSession) {
        // Update user association if provided
        if (userId && !existingSession.userId) {
          existingSession.userId = new Types.ObjectId(userId);
          await existingSession.save();
        }
        return existingSession;
      }
    }

    // Create new session
    const newSessionId = sessionId || uuidv4();
    const newSession = new this.chatSessionModel({
      sessionId: newSessionId,
      userId: userId ? new Types.ObjectId(userId) : undefined,
      locale,
      timezone,
      favoriteTeams: favoriteTeams || [],
      messages: [],
      messageCount: 0,
    });

    await newSession.save();
    return newSession;
  }

  async chat(
    input: WorldcupChatInput,
    userId?: string,
  ): Promise<WorldcupChatResponse> {
    try {
      const client = this.getAnthropicClient();
      const { messages, locale, timezone, favoriteTeams, sessionId } = input;

      if (!messages || messages.length === 0) {
        return {
          success: false,
          message: '',
          error: 'Messages are required',
        };
      }

      const validLocale: Locale = locale === 'es' || locale === 'en' ? locale : 'es';
      const validTimezone = timezone || 'America/New_York';

      // Get or create session
      const session = await this.getOrCreateSession(
        sessionId,
        userId,
        validLocale,
        validTimezone,
        favoriteTeams,
      );

      // Check message limit for anonymous users
      if (!userId && session.messageCount >= ANONYMOUS_MESSAGE_LIMIT) {
        throw new ForbiddenException({
          code: 'MESSAGE_LIMIT_REACHED',
          message:
            validLocale === 'es'
              ? 'Has alcanzado el límite de 20 mensajes. Crea una cuenta para continuar.'
              : 'You have reached the 20 message limit. Create an account to continue.',
          messageCount: session.messageCount,
          limit: ANONYMOUS_MESSAGE_LIMIT,
        });
      }

      // User context for personalized responses
      const userContext = {
        favoriteTeams: favoriteTeams || session.favoriteTeams || [],
        timezone: validTimezone,
      };

      // Build the conversation messages for Claude
      const claudeMessages: Anthropic.MessageParam[] = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Initial API call with personalized system prompt and ALL tools
      let response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: getSystemPrompt(validLocale, validTimezone, userContext),
        tools: allWorldCupTools,
        messages: claudeMessages,
      });

      // Agentic loop - handle tool calls
      const maxIterations = 5;
      let iterations = 0;
      let collectedData: TypeChatDataPayload | undefined;
      let collectedAction: TypeActionResult | undefined;

      while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
        iterations++;

        // Find the tool use block
        const toolUseBlock = response.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );

        if (!toolUseBlock) break;

        let toolResult: { success: boolean; data?: unknown; error?: string };

        // Check if this is an ACTION tool or a QUERY tool
        if (ACTION_TOOL_NAMES.has(toolUseBlock.name)) {
          // Execute action tool
          const actionResult = executeAction(
            toolUseBlock.name,
            toolUseBlock.input as Record<string, unknown>,
            this.queriesService,
            validLocale,
          );

          if (actionResult) {
            collectedAction = actionResult as unknown as TypeActionResult;
            toolResult = {
              success: actionResult.success,
              data: actionResult.artifact?.embedData || { message: 'Action completed' },
              error: actionResult.error,
            };
          } else {
            toolResult = {
              success: false,
              error: 'Action not implemented',
            };
          }
        } else {
          // Execute query tool
          toolResult = executeTool(
            toolUseBlock.name,
            toolUseBlock.input as Record<string, unknown>,
            this.queriesService,
            validLocale,
          );

          // If tool returned match/venue data, collect it for the response
          if (toolResult.success && toolResult.data) {
            const data = toolResult.data as Record<string, unknown>;
            if (data.matches && Array.isArray(data.matches)) {
              collectedData = {
                type: 'matches',
                items: (data.matches as MatchData[]).map((match) => ({
                  type: 'match' as const,
                  data: match,
                })),
              };
            } else if (data.venues && Array.isArray(data.venues)) {
              collectedData = {
                type: 'venues',
                items: data.venues.map((venue) => ({
                  type: 'venue' as const,
                  data: venue,
                })),
              };
            } else if (data.teams && Array.isArray(data.teams)) {
              collectedData = {
                type: 'teams',
                items: data.teams.map((team) => ({
                  type: 'team' as const,
                  data: team,
                })),
              };
            }
          }
        }

        // Add assistant response with tool use to messages
        claudeMessages.push({
          role: 'assistant',
          content: response.content,
        });

        // Add tool result to messages
        claudeMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: JSON.stringify(toolResult),
            },
          ],
        });

        // Make another API call with the tool result
        response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: getSystemPrompt(validLocale, validTimezone, userContext),
          tools: allWorldCupTools,
          messages: claudeMessages,
        });
      }

      // Extract the final text response
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );

      const messageContent = textBlock?.text || '';

      // Store messages in session
      const userMessage = messages[messages.length - 1];
      const storedMessages: StoredMessage[] = [
        {
          role: userMessage.role,
          content: userMessage.content,
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: messageContent,
          timestamp: new Date(),
          data: collectedData as unknown as Record<string, unknown>,
          action: collectedAction as unknown as Record<string, unknown>,
        },
      ];

      // Update session
      session.messages.push(...storedMessages);
      session.messageCount += 1;
      session.lastMessageAt = new Date();
      if (favoriteTeams && favoriteTeams.length > 0) {
        session.favoriteTeams = favoriteTeams;
      }
      await session.save();

      const chatResponse: WorldcupChatResponse = {
        success: true,
        message: messageContent,
        data: collectedData as unknown as ChatDataPayload,
        action: collectedAction as unknown as ActionResult,
        sessionId: session.sessionId,
        messageCount: session.messageCount,
        messageLimit: userId ? undefined : ANONYMOUS_MESSAGE_LIMIT,
        isAtLimit: !userId && session.messageCount >= ANONYMOUS_MESSAGE_LIMIT,
      };

      return chatResponse;
    } catch (error) {
      console.error('World Cup chat error:', error);

      if (error instanceof ForbiddenException) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred';

      return {
        success: false,
        message: '',
        error: errorMessage,
      };
    }
  }

  async getSessionHistory(sessionId: string): Promise<ChatSession | null> {
    return this.chatSessionModel.findOne({ sessionId });
  }

  async getUserSessions(userId: string): Promise<ChatSession[]> {
    return this.chatSessionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ lastMessageAt: -1 })
      .limit(10);
  }

  async clearSession(sessionId: string): Promise<boolean> {
    const result = await this.chatSessionModel.deleteOne({ sessionId });
    return result.deletedCount > 0;
  }

  async updateFavoriteTeams(
    sessionId: string,
    favoriteTeams: string[],
  ): Promise<ChatSession | null> {
    return this.chatSessionModel.findOneAndUpdate(
      { sessionId },
      { favoriteTeams },
      { new: true },
    );
  }
}
