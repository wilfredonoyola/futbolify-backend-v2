// Telegram Service - Handles user management and bot operations

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { Message } from 'telegraf/types';

import { PlatformLink, PlatformLinkDocument, Platform } from './schemas/platform-link.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Quiniela, QuinielaDocument, QuinielaMember } from '../quiniela/schemas/quiniela.schema';
import { messages, getLang, Lang } from './i18n/messages';

// Types for Telegram context
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface EnsureUserInput {
  platform: Platform;
  platformUserId: string;
  displayName: string;
  avatarUrl?: string;
  platformUsername?: string;
  platformGroupId?: string;
}

interface EnsureUserResult {
  user: UserDocument;
  platformLink: PlatformLinkDocument;
  isNew: boolean;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf;

  constructor(
    @InjectModel(PlatformLink.name) private platformLinkModel: Model<PlatformLinkDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Quiniela.name) private quinielaModel: Model<QuinielaDocument>,
    private configService: ConfigService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.bot = new Telegraf(token);
      this.setupCommands();
      this.logger.log('Telegram bot initialized');
    } else {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set - bot disabled');
    }
  }

  async onModuleInit() {
    // Fix the email index to be sparse (allows multiple null values for ghost users)
    try {
      const collection = this.userModel.collection;
      const indexes = await collection.indexes();
      const emailIndex = indexes.find(idx => idx.name === 'email_1');

      if (emailIndex && !emailIndex.sparse) {
        this.logger.log('Dropping non-sparse email index...');
        await collection.dropIndex('email_1');
        this.logger.log('Email index dropped - Mongoose will recreate with sparse: true');
      }
    } catch (error) {
      // Index might not exist, which is fine
      this.logger.debug('Index check/fix skipped: ' + error.message);
    }
  }

  // ============ CORE: ENSURE USER (Zero Friction Registration) ============

  /**
   * Creates or retrieves a user based on platform identity.
   * This is the core of the ghost user system - no registration required.
   * Uses findOneAndUpdate to handle race conditions safely.
   */
  async ensureUser(input: EnsureUserInput): Promise<EnsureUserResult> {
    // First, try to find existing platform link
    let existingLink = await this.platformLinkModel.findOne({
      platform: input.platform,
      platformUserId: input.platformUserId,
    }).exec();

    if (existingLink) {
      // Platform link exists - find the user
      const user = await this.userModel.findById(existingLink.userId).exec();
      if (user) {
        return { user, platformLink: existingLink, isNew: false };
      }
      // User was deleted but link exists - clean up and recreate
      await this.platformLinkModel.deleteOne({ _id: existingLink._id });
      existingLink = null;
    }

    // No existing link - create new ghost user
    const userName = this.generateUserName(input.displayName, input.platformUserId);

    const userData: any = {
      userName,
      name: input.displayName,
      isGhostUser: true,
      isOnboardingCompleted: true,
      roles: ['USER'],
    };

    if (input.avatarUrl) {
      userData.avatarUrl = input.avatarUrl;
    }

    const newUser = await this.userModel.create(userData);

    // Create platform link with error handling for race conditions
    try {
      const platformLink = await this.platformLinkModel.create({
        userId: newUser._id,
        platform: input.platform,
        platformUserId: input.platformUserId,
        platformUsername: input.platformUsername,
        platformGroupId: input.platformGroupId,
      });

      this.logger.log(`Created ghost user ${newUser._id} for ${input.platform}:${input.platformUserId}`);
      return { user: newUser, platformLink, isNew: true };

    } catch (error) {
      // Duplicate key error - another request created the link first
      if (error.code === 11000) {
        // Delete the orphaned user we just created
        await this.userModel.deleteOne({ _id: newUser._id });

        // Find the existing link and user
        const existingLink = await this.platformLinkModel.findOne({
          platform: input.platform,
          platformUserId: input.platformUserId,
        }).exec();

        if (existingLink) {
          const user = await this.userModel.findById(existingLink.userId).exec();
          if (user) {
            return { user, platformLink: existingLink, isNew: false };
          }
        }
      }
      throw error;
    }
  }

  private generateUserName(displayName: string, platformUserId: string): string {
    // Create unique username from display name + random suffix
    const base = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10) || 'user';
    const suffix = platformUserId.slice(-4);
    return `${base}_${suffix}`;
  }

  // ============ BOT SETUP ============

  private setupCommands() {
    // /start - Welcome message OR auto-join via deep link
    this.bot.start(async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const lang = getLang(ctx.from?.language_code);
      const payload = (ctx as any).startPayload || '';

      // Check if this is a deep link to join a quiniela
      if (payload) {
        const code = payload.startsWith('join_')
          ? payload.replace('join_', '').toUpperCase()
          : payload.toUpperCase();

        try {
          const result = await this.joinQuiniela(code, user._id.toString(), user.name || user.userName, user.avatarUrl);

          return ctx.reply(
            messages.autoJoinSuccess[lang](user.name || user.userName, result.quinielaName, result.memberCount),
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          await ctx.reply(messages.autoJoinError[lang](error.message || 'Error'));
          return;
        }
      }

      // Normal welcome message
      await ctx.reply(
        `${messages.welcome[lang](user.name || user.userName)}\n\n${messages.commands[lang]}`,
        { parse_mode: 'HTML' }
      );
    });

    // /crear or /create - Create quiniela
    this.bot.command(['crear', 'create'], async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const lang = getLang(ctx.from?.language_code);
      const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

      if (!args) {
        return ctx.reply(messages.createNoName[lang]);
      }

      try {
        const quiniela = await this.createQuiniela(args, user._id.toString(), user.name || user.userName);
        const botUsername = this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'futbolify_quinielas_bot';
        const escapedUsername = botUsername.replace(/_/g, '\\_');
        const telegramLink = `https://t.me/${escapedUsername}?start=${quiniela.code}`;
        const webLink = `https://futbolify.com/q/${quiniela.code}`;

        await ctx.reply(
          messages.createSuccess[lang](quiniela.name, quiniela.code, telegramLink, webLink),
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        this.logger.error('Error creating quiniela', error);
        await ctx.reply(messages.createError[lang]);
      }
    });

    // /unirse or /join - Join quiniela
    this.bot.command(['unirse', 'join'], async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const lang = getLang(ctx.from?.language_code);
      const code = ctx.message.text.split(' ')[1]?.trim().toUpperCase();

      if (!code) {
        return ctx.reply(messages.joinNoCode[lang]);
      }

      try {
        const result = await this.joinQuiniela(code, user._id.toString(), user.name || user.userName, user.avatarUrl);
        await ctx.reply(
          messages.joinSuccess[lang](result.quinielaName, result.memberCount),
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        this.logger.error('Error joining quiniela', error);
        await ctx.reply(`❌ ${error.message || 'Error'}`);
      }
    });

    // /predecir or /predict - Show quiniela selector then matches
    this.bot.command(['predecir', 'predict'], async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const lang = getLang(ctx.from?.language_code);
      const quinielas = await this.getUserQuinielas(user._id.toString());

      if (quinielas.length === 0) {
        return ctx.reply(messages.predictNoQuinielas[lang]);
      }

      // If only one quiniela, show it directly
      if (quinielas.length === 1) {
        return ctx.reply(
          `📊 *${quinielas[0].name}*\n\n${messages.predictComingSoon[lang]}`,
          { parse_mode: 'Markdown' }
        );
      }

      // Multiple quinielas - show selector buttons
      const buttons = quinielas.map(q => [
        Markup.button.callback(`📋 ${q.name} (${q.memberCount} 👥)`, `predict:${q.code}`)
      ]);

      await ctx.reply(
        messages.predictSelectQuiniela[lang],
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        }
      );
    });

    // /ranking or /leaderboard - Show quiniela selector then leaderboard
    this.bot.command(['ranking', 'leaderboard'], async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const lang = getLang(ctx.from?.language_code);
      const codeArg = ctx.message.text.split(' ')[1]?.trim().toUpperCase();
      const quinielas = await this.getUserQuinielas(user._id.toString());

      if (quinielas.length === 0) {
        return ctx.reply(messages.rankingNoQuinielas[lang]);
      }

      // If code provided, show that quiniela's ranking directly
      if (codeArg) {
        const quiniela = quinielas.find(q => q.code === codeArg);
        if (!quiniela) {
          return ctx.reply(messages.rankingNotFound[lang]);
        }
        const leaderboard = this.formatLeaderboard(quiniela, lang);
        return ctx.reply(
          `${messages.rankingTitle[lang](quiniela.name)}\n\n${leaderboard}`,
          { parse_mode: 'Markdown' }
        );
      }

      // If only one quiniela, show it directly
      if (quinielas.length === 1) {
        const leaderboard = this.formatLeaderboard(quinielas[0], lang);
        return ctx.reply(
          `${messages.rankingTitle[lang](quinielas[0].name)}\n\n${leaderboard}`,
          { parse_mode: 'Markdown' }
        );
      }

      // Multiple quinielas - show selector buttons
      const buttons = quinielas.map(q => [
        Markup.button.callback(`🏆 ${q.name} (${q.memberCount} 👥)`, `ranking:${q.code}`)
      ]);

      await ctx.reply(
        messages.rankingSelectQuiniela[lang],
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(buttons)
        }
      );
    });

    // /misquinielas or /mypools - List user's quinielas
    this.bot.command(['misquinielas', 'mypools'], async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const lang = getLang(ctx.from?.language_code);
      const quinielas = await this.getUserQuinielas(user._id.toString());

      if (quinielas.length === 0) {
        return ctx.reply(messages.myQuinielasEmpty[lang]);
      }

      const list = quinielas.map((q, i) => {
        const member = q.members.find(m => m.userId.toString() === user._id.toString());
        const rank = member?.rank || '-';
        const points = member?.totalPoints || 0;
        return `${i + 1}. *${q.name}*\n   📊 #${rank} | ${points} pts | 👥 ${q.memberCount}`;
      }).join('\n\n');

      await ctx.reply(
        `${messages.myQuinielasTitle[lang]}\n\n${list}`,
        { parse_mode: 'Markdown' }
      );
    });

    // /partidos or /matches - Upcoming matches
    this.bot.command(['partidos', 'matches'], async (ctx) => {
      const lang = getLang(ctx.from?.language_code);
      await ctx.reply(messages.matchesComingSoon[lang], { parse_mode: 'Markdown' });
    });

    // Handle callback queries (for inline buttons)
    this.bot.on('callback_query', async (ctx) => {
      const data = (ctx.callbackQuery as { data?: string }).data;
      if (!data) return;

      const { user } = await this.ensureUserFromContext(ctx);
      const lang = getLang(ctx.from?.language_code);

      // Handle ranking selection: ranking:CODE
      if (data.startsWith('ranking:')) {
        const code = data.replace('ranking:', '');
        const quiniela = await this.quinielaModel.findOne({ code }).exec();

        if (!quiniela) {
          await ctx.answerCbQuery(messages.rankingNotFound[lang]);
          return;
        }

        const leaderboard = this.formatLeaderboard(quiniela, lang);
        await ctx.answerCbQuery(messages.callbackRankingFor[lang](quiniela.name));
        await ctx.editMessageText(
          `${messages.rankingTitle[lang](quiniela.name)}\n\n${leaderboard}`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Handle predict selection: predict:CODE
      if (data.startsWith('predict:')) {
        const code = data.replace('predict:', '');
        const quiniela = await this.quinielaModel.findOne({ code }).exec();

        if (!quiniela) {
          await ctx.answerCbQuery(messages.rankingNotFound[lang]);
          return;
        }

        await ctx.answerCbQuery(messages.callbackPredictFor[lang](quiniela.name));
        await ctx.editMessageText(
          `📊 *${quiniela.name}*\n\n${messages.predictComingSoon[lang]}`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Handle prediction callbacks: pred:matchId:outcome (future)
      if (data.startsWith('pred:')) {
        const [, matchId, outcome] = data.split(':');
        // TODO: Submit prediction via quiniela service
        await ctx.answerCbQuery(`✅ ${outcome}`);
        await ctx.editMessageText(`✅ ${matchId}`);
      }
    });
  }

  // ============ HELPER METHODS ============

  private async ensureUserFromContext(ctx: any): Promise<EnsureUserResult> {
    const from: TelegramUser = ctx.from;
    const chat = ctx.chat;

    const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ');

    return this.ensureUser({
      platform: Platform.TELEGRAM,
      platformUserId: from.id.toString(),
      displayName,
      platformUsername: from.username,
      platformGroupId: chat?.type !== 'private' ? chat?.id.toString() : undefined,
    });
  }

  private async createQuiniela(name: string, userId: string, ownerName: string): Promise<QuinielaDocument> {
    const code = this.generateInviteCode();

    const quiniela = await this.quinielaModel.create({
      name,
      code,
      ownerId: new Types.ObjectId(userId),
      ownerName,
      status: 'open',
      predictionMode: 'simple',
      members: [{
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        userName: ownerName,
        predictions: [],
        totalPoints: 0,
        correctPredictions: 0,
        exactScores: 0,
        joinedAt: new Date(),
      }],
      memberCount: 1,
    });

    return quiniela;
  }

  private async joinQuiniela(code: string, odUserId: string, userName: string, avatarUrl?: string): Promise<{ quinielaName: string; memberCount: number }> {
    const quiniela = await this.quinielaModel.findOne({ code: code.toUpperCase() }).exec();
    const lang: Lang = 'es'; // Default for error messages

    if (!quiniela) {
      throw new Error(messages.joinNotFound[lang]);
    }

    const userId = new Types.ObjectId(odUserId);

    // Check if already a member
    const isMember = quiniela.members.some(m => m.userId.toString() === odUserId);
    if (isMember) {
      throw new Error(messages.joinAlreadyMember[lang]);
    }

    // Add member
    const newMember: QuinielaMember = {
      _id: new Types.ObjectId(),
      userId,
      userName,
      avatarUrl,
      predictions: [],
      totalPoints: 0,
      correctPredictions: 0,
      exactScores: 0,
      joinedAt: new Date(),
    } as QuinielaMember;

    quiniela.members.push(newMember);
    quiniela.memberCount = quiniela.members.length;
    await quiniela.save();

    return {
      quinielaName: quiniela.name,
      memberCount: quiniela.memberCount,
    };
  }

  private async getUserQuinielas(userId: string): Promise<QuinielaDocument[]> {
    return this.quinielaModel.find({
      'members.userId': new Types.ObjectId(userId),
    }).exec();
  }

  private formatLeaderboard(quiniela: QuinielaDocument, lang: Lang): string {
    const medals = ['🥇', '🥈', '🥉'];

    const sorted = [...quiniela.members]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 10);

    if (sorted.length === 0) {
      return messages.rankingNoParticipants[lang];
    }

    return sorted.map((m, i) => {
      const medal = medals[i] || `${i + 1}.`;
      return `${medal} ${m.userName} — ${m.totalPoints} pts`;
    }).join('\n');
  }

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // ============ BOT LIFECYCLE ============

  async startBot() {
    if (!this.bot) {
      this.logger.warn('Bot not initialized - cannot start');
      return;
    }

    try {
      // Use webhook in production, polling in development
      const webhookUrl = this.configService.get<string>('TELEGRAM_WEBHOOK_URL');

      if (webhookUrl) {
        await this.bot.telegram.setWebhook(webhookUrl);
        this.logger.log(`Telegram webhook set to ${webhookUrl}`);
      } else {
        await this.bot.launch();
        this.logger.log('Telegram bot started with polling');
      }
    } catch (error) {
      this.logger.error('Failed to start Telegram bot', error);
    }
  }

  async stopBot() {
    if (this.bot) {
      this.bot.stop('SIGTERM');
      this.logger.log('Telegram bot stopped');
    }
  }

  // For webhook mode
  handleWebhook(update: any) {
    if (this.bot) {
      this.bot.handleUpdate(update);
    }
  }
}
