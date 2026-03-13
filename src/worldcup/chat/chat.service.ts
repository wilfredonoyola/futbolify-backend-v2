// Chat Service - Main agentic loop for World Cup 2026 chat
//
// PERFORMANCE NOTES:
// - System prompt is generated per-request (fast string concatenation)
// - Session lookup requires DB query (consider Redis cache for high traffic)
// - Tool data (matches, teams, venues) is in-memory via QueriesService
//
// TODO: Implement streaming for perceived speed improvement
// - Create REST endpoint with SSE for streaming responses
// - Use client.messages.stream() instead of client.messages.create()
// - Frontend: consume SSE stream and render tokens progressively
// - GraphQL mutation remains for backwards compatibility
//

import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

import { QueriesService } from '../queries/queries.service';
import { QuinielaService } from '../../quiniela/quiniela.service';
import { ChatSession, ChatSessionDocument, StoredMessage } from '../schemas/chat-session.schema';
import { WorldcupChatInput, WorldcupChatResponse, ChatDataPayload, ActionResult } from '../dto/chat.dto';
import { getSystemPrompt } from './system-prompt';
import { allWorldCupTools, ACTION_TOOL_NAMES } from './tools';
import { executeTool } from './tool-handlers';
import { executeAction } from './action-handlers';
import {
  ANONYMOUS_MESSAGE_LIMIT,
  AUTHENTICATED_MESSAGE_LIMIT,
  MESSAGE_LIMIT_RESET_HOURS,
} from './constants';
import type { Locale, ChatDataPayload as TypeChatDataPayload, ActionResult as TypeActionResult, MatchData } from './types';

@Injectable()
export class ChatService {
  private anthropicClient: Anthropic | null = null;
  // Cache system prompts by locale (with no favorite teams)
  private systemPromptCache: Map<string, string> = new Map();

  constructor(
    @InjectModel(ChatSession.name)
    private chatSessionModel: Model<ChatSessionDocument>,
    private readonly queriesService: QueriesService,
    private readonly quinielaService: QuinielaService,
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

  /**
   * Check if message count should be reset (24h period)
   * Returns the current message count after potential reset
   */
  private checkAndResetMessageCount(session: ChatSessionDocument): number {
    if (!session.lastMessageAt) {
      return 0;
    }

    const hoursSinceLastMessage =
      (Date.now() - new Date(session.lastMessageAt).getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastMessage >= MESSAGE_LIMIT_RESET_HOURS) {
      // Reset the counter
      session.messageCount = 0;
      return 0;
    }

    return session.messageCount;
  }

  /**
   * Get warning info based on remaining messages
   */
  private getWarningInfo(
    messageCount: number,
    limit: number,
    locale: 'es' | 'en',
  ): { warningLevel: number; warningMessage: string } | null {
    const remaining = limit - messageCount;

    if (remaining > 3) {
      return null; // No warning yet
    }

    let warningLevel: number;
    let warningMessage: string;

    if (remaining === 3) {
      warningLevel = 1;
      warningMessage =
        locale === 'es'
          ? `Te quedan ${remaining} mensajes hoy. Crea una cuenta gratis para mensajes ilimitados.`
          : `You have ${remaining} messages left today. Create a free account for unlimited messages.`;
    } else if (remaining === 1) {
      warningLevel = 2;
      warningMessage =
        locale === 'es'
          ? `¡Último mensaje! Crea tu cuenta gratis para seguir chateando.`
          : `Last message! Create your free account to keep chatting.`;
    } else {
      warningLevel = 3;
      warningMessage =
        locale === 'es'
          ? `Te quedan ${remaining} mensajes hoy.`
          : `You have ${remaining} messages left today.`;
    }

    return { warningLevel, warningMessage };
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
      const { messages, locale, timezone, favoriteTeams, sessionId, anonymousCreatorId } = input;

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

      // Check and potentially reset message count (24h period)
      const currentMessageCount = this.checkAndResetMessageCount(session);

      // Determine the appropriate limit
      const messageLimit = userId
        ? AUTHENTICATED_MESSAGE_LIMIT
        : ANONYMOUS_MESSAGE_LIMIT;

      // Check message limit
      if (currentMessageCount >= messageLimit) {
        const errorMessage = userId
          ? validLocale === 'es'
            ? `Has alcanzado el límite de ${messageLimit} mensajes por día. Vuelve mañana.`
            : `You have reached the ${messageLimit} message limit per day. Come back tomorrow.`
          : validLocale === 'es'
            ? `Has alcanzado el límite de ${messageLimit} mensajes. Crea una cuenta gratis para continuar.`
            : `You have reached the ${messageLimit} message limit. Create a free account to continue.`;

        throw new ForbiddenException({
          code: 'MESSAGE_LIMIT_REACHED',
          message: errorMessage,
          messageCount: currentMessageCount,
          limit: messageLimit,
          isAuthenticated: !!userId,
        });
      }

      // Calculate warning info (before incrementing)
      const warningInfo = this.getWarningInfo(
        currentMessageCount + 1, // After this message
        messageLimit,
        validLocale,
      );

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

      // Get or cache system prompt (personalized prompts are generated fresh)
      const cacheKey = `${validLocale}:${validTimezone}:${userContext.favoriteTeams.join(',')}`;
      let systemPrompt = this.systemPromptCache.get(cacheKey);
      if (!systemPrompt) {
        systemPrompt = getSystemPrompt(validLocale, validTimezone, userContext);
        this.systemPromptCache.set(cacheKey, systemPrompt);
        // Limit cache size to prevent memory bloat
        if (this.systemPromptCache.size > 100) {
          const firstKey = this.systemPromptCache.keys().next().value;
          if (firstKey) this.systemPromptCache.delete(firstKey);
        }
      }

      // Initial API call with personalized system prompt and ALL tools
      // Using Haiku 3.5 for cost efficiency (4x cheaper than Sonnet, same quality for this use case)
      let response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: systemPrompt,
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
          const actionResult = await executeAction(
            toolUseBlock.name,
            toolUseBlock.input as Record<string, unknown>,
            this.queriesService,
            this.quinielaService,
            validLocale,
            anonymousCreatorId, // Pass from frontend for quiniela creation
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

        // Make another API call with the tool result (reuse cached system prompt)
        response = await client.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          system: systemPrompt,
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
        messageLimit: messageLimit,
        messagesRemaining: messageLimit - session.messageCount,
        isAtLimit: session.messageCount >= messageLimit,
        warning: warningInfo
          ? {
              level: warningInfo.warningLevel,
              message: warningInfo.warningMessage,
            }
          : undefined,
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
