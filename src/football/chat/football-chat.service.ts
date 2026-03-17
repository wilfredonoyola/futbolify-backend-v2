// Football Chat Service - Universal agentic loop for all leagues
// Supports Mundial 2026 (static data) + all other leagues (API-Football) + Quinielas

import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

import { ApiFootballAdapter } from './adapters/api-football.adapter';
import { FootballDataAdapter } from './adapters/football-data.adapter';
import { QueriesService } from '../../worldcup/queries/queries.service';
import { QuinielaService } from '../../quiniela/quiniela.service';
import { ChatSession, ChatSessionDocument, StoredMessage } from '../../worldcup/schemas/chat-session.schema';
import { getSystemPrompt } from './system-prompt';
import { allFootballTools, ACTION_TOOL_NAMES } from './tools';
import { executeTool } from './tool-handlers';
import { executeAction } from './action-handlers';
import {
  ANONYMOUS_MESSAGE_LIMIT,
  AUTHENTICATED_MESSAGE_LIMIT,
  MESSAGE_LIMIT_RESET_HOURS,
} from './constants';
import type { Locale, ChatDataPayload, ActionResult, MatchData } from './types';

export interface FootballChatInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  locale: string;
  timezone: string;
  leagueId?: string;
  teamId?: string;
  matchId?: string;
  favoriteTeams?: string[];
  sessionId?: string;
  userId?: string;
  anonymousCreatorId?: string; // For quiniela creation
}

export interface FootballChatResponse {
  success: boolean;
  message: string;
  data?: ChatDataPayload;
  action?: ActionResult;
  suggestions?: string[];
  sessionId?: string;
  messageCount?: number;
  messageLimit?: number;
  messagesRemaining?: number;
  isAtLimit?: boolean;
  warning?: {
    level: number;
    message: string;
  };
  error?: string;
}

@Injectable()
export class FootballChatService {
  private anthropicClient: Anthropic | null = null;
  private systemPromptCache: Map<string, string> = new Map();

  constructor(
    @InjectModel(ChatSession.name)
    private chatSessionModel: Model<ChatSessionDocument>,
    private readonly apiFootballAdapter: ApiFootballAdapter,
    private readonly footballDataAdapter: FootballDataAdapter, // FREE API for European leagues
    private readonly queriesService: QueriesService, // For Mundial 2026 static data
    private readonly quinielaService: QuinielaService, // For quiniela creation
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

  private checkAndResetMessageCount(session: ChatSessionDocument): number {
    if (!session.lastMessageAt) {
      return 0;
    }

    const hoursSinceLastMessage =
      (Date.now() - new Date(session.lastMessageAt).getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastMessage >= MESSAGE_LIMIT_RESET_HOURS) {
      session.messageCount = 0;
      return 0;
    }

    return session.messageCount;
  }

  private getWarningInfo(
    messageCount: number,
    limit: number,
    locale: Locale,
  ): { warningLevel: number; warningMessage: string } | null {
    const remaining = limit - messageCount;

    if (remaining > 3) {
      return null;
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
          ? `Ultimo mensaje! Crea tu cuenta gratis para seguir chateando.`
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
    if (sessionId) {
      const existingSession = await this.chatSessionModel.findOne({ sessionId });
      if (existingSession) {
        if (userId && !existingSession.userId) {
          existingSession.userId = new Types.ObjectId(userId);
          await existingSession.save();
        }
        return existingSession;
      }
    }

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

  async chat(input: FootballChatInput): Promise<FootballChatResponse> {
    try {
      const client = this.getAnthropicClient();
      const {
        messages,
        locale,
        timezone,
        leagueId,
        favoriteTeams,
        sessionId,
        userId,
        anonymousCreatorId,
      } = input;

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

      // Check message limits
      const currentMessageCount = this.checkAndResetMessageCount(session);
      const messageLimit = userId ? AUTHENTICATED_MESSAGE_LIMIT : ANONYMOUS_MESSAGE_LIMIT;

      if (currentMessageCount >= messageLimit) {
        const errorMessage = userId
          ? validLocale === 'es'
            ? `Has alcanzado el limite de ${messageLimit} mensajes por dia. Vuelve manana.`
            : `You have reached the ${messageLimit} message limit per day. Come back tomorrow.`
          : validLocale === 'es'
            ? `Has alcanzado el limite de ${messageLimit} mensajes. Crea una cuenta gratis para continuar.`
            : `You have reached the ${messageLimit} message limit. Create a free account to continue.`;

        throw new ForbiddenException({
          code: 'MESSAGE_LIMIT_REACHED',
          message: errorMessage,
          messageCount: currentMessageCount,
          limit: messageLimit,
          isAuthenticated: !!userId,
        });
      }

      // Calculate warning info
      const warningInfo = this.getWarningInfo(
        currentMessageCount + 1,
        messageLimit,
        validLocale,
      );

      // User context for personalized responses
      const userContext = {
        favoriteTeams: favoriteTeams || session.favoriteTeams || [],
        timezone: validTimezone,
        leagueContext: leagueId,
      };

      // Build conversation messages
      const claudeMessages: Anthropic.MessageParam[] = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Get or cache system prompt
      const cacheKey = `${validLocale}:${validTimezone}:${leagueId || ''}:${userContext.favoriteTeams.join(',')}`;
      let systemPrompt = this.systemPromptCache.get(cacheKey);
      if (!systemPrompt) {
        systemPrompt = getSystemPrompt(validLocale, validTimezone, userContext);
        this.systemPromptCache.set(cacheKey, systemPrompt);
        if (this.systemPromptCache.size > 100) {
          const firstKey = this.systemPromptCache.keys().next().value;
          if (firstKey) this.systemPromptCache.delete(firstKey);
        }
      }

      // Initial API call with Haiku for cost efficiency
      let response = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: systemPrompt,
        tools: allFootballTools,
        messages: claudeMessages,
      });

      // Agentic loop - handle tool calls
      const maxIterations = 5;
      let iterations = 0;
      let collectedData: ChatDataPayload | undefined;
      let collectedAction: ActionResult | undefined;
      const suggestions: string[] = [];

      while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
        iterations++;

        const toolUseBlock = response.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );

        if (!toolUseBlock) break;

        let toolResult: { success: boolean; data?: unknown; error?: string };

        // Check if action or query tool
        if (ACTION_TOOL_NAMES.has(toolUseBlock.name)) {
          const actionResult = await executeAction(
            toolUseBlock.name,
            toolUseBlock.input as Record<string, unknown>,
            this.apiFootballAdapter,
            this.queriesService,
            this.quinielaService,
            validLocale,
            anonymousCreatorId,
          );

          if (actionResult) {
            collectedAction = actionResult;
            toolResult = {
              success: actionResult.success,
              data: actionResult.artifact?.data || { message: 'Action completed' },
              error: actionResult.error,
            };
          } else {
            toolResult = {
              success: false,
              error: 'Action not implemented',
            };
          }
        } else {
          // Execute query tool - uses QueriesService for Mundial 2026, Football-Data.org for Europe, API-Football for rest
          toolResult = await executeTool(
            toolUseBlock.name,
            toolUseBlock.input as Record<string, unknown>,
            {
              apiFootball: this.apiFootballAdapter,
              footballData: this.footballDataAdapter,
            },
            this.queriesService,
            validLocale,
          );

          // Collect data for response cards
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
            } else if (data.standings && Array.isArray(data.standings)) {
              collectedData = {
                type: 'standings',
                items: data.standings.map((standing) => ({
                  type: 'standing' as const,
                  data: standing,
                })),
              };
            }
          }
        }

        // Add tool use to messages
        claudeMessages.push({
          role: 'assistant',
          content: response.content,
        });

        // Add tool result
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

        // Continue conversation
        response = await client.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1024,
          system: systemPrompt,
          tools: allFootballTools,
          messages: claudeMessages,
        });
      }

      // Extract final text response
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );

      const messageContent = textBlock?.text || '';

      // Extract suggestions from the response (if Claude mentioned them)
      const suggestionMatches = messageContent.match(/[""]([^""]+)[""]|(?:También puedo|I can also):?\s*(.+)/gi);
      if (suggestionMatches) {
        suggestionMatches.slice(0, 3).forEach((s) => {
          const clean = s.replace(/["'"]/g, '').trim();
          if (clean.length > 10 && clean.length < 60) {
            suggestions.push(clean);
          }
        });
      }

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

      return {
        success: true,
        message: messageContent,
        data: collectedData,
        action: collectedAction,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        sessionId: session.sessionId,
        messageCount: session.messageCount,
        messageLimit,
        messagesRemaining: messageLimit - session.messageCount,
        isAtLimit: session.messageCount >= messageLimit,
        warning: warningInfo
          ? {
              level: warningInfo.warningLevel,
              message: warningInfo.warningMessage,
            }
          : undefined,
      };
    } catch (error) {
      console.error('Football chat error:', error);

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
}
