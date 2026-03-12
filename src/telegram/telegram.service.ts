// Telegram Service - Handles user management and bot operations

import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Telegraf, Markup } from 'telegraf';
import { Message } from 'telegraf/types';

import { PlatformLink, PlatformLinkDocument, Platform } from './schemas/platform-link.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Quiniela, QuinielaDocument, QuinielaMember } from '../quiniela/schemas/quiniela.schema';
import { messages, getLang, Lang } from './i18n/messages';
import { QueriesService } from '../worldcup/queries/queries.service';
import { QuinielaService } from '../quiniela/quiniela.service';

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
    @Inject(forwardRef(() => QueriesService)) private queriesService: QueriesService,
    @Inject(forwardRef(() => QuinielaService)) private quinielaService: QuinielaService,
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

      // If only one quiniela, show matches directly
      if (quinielas.length === 1) {
        return this.showMatchesForPrediction(ctx, quinielas[0], user._id.toString(), lang);
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

      // Handle predict selection: predict:CODE (select quiniela, show matches)
      if (data.startsWith('predict:') && !data.includes(':match:')) {
        const code = data.replace('predict:', '');
        const quiniela = await this.quinielaModel.findOne({ code }).exec();

        if (!quiniela) {
          await ctx.answerCbQuery(messages.rankingNotFound[lang]);
          return;
        }

        await ctx.answerCbQuery(messages.callbackPredictFor[lang](quiniela.name));
        await this.showMatchesForPrediction(ctx, quiniela, user._id.toString(), lang, true);
        return;
      }

      // Handle match selection: predict:CODE:match:MATCHID (select match, show prediction options)
      if (data.includes(':match:')) {
        const parts = data.split(':');
        const code = parts[1];
        const matchId = parts[3];

        const quiniela = await this.quinielaModel.findOne({ code }).exec();
        if (!quiniela) {
          await ctx.answerCbQuery(messages.rankingNotFound[lang]);
          return;
        }

        await this.showPredictionOptions(ctx, quiniela, matchId, lang);
        return;
      }

      // Handle prediction submission: pred:CODE:MATCHID:OUTCOME
      if (data.startsWith('pred:')) {
        const [, code, matchId, outcome] = data.split(':');

        try {
          const quiniela = await this.quinielaModel.findOne({ code }).exec();
          if (!quiniela) {
            await ctx.answerCbQuery(messages.rankingNotFound[lang]);
            return;
          }

          // Check if match has already started
          const match = this.queriesService.getMatchById(matchId);
          if (match) {
            const matchTime = new Date(match.dateTimeUTC);
            if (matchTime <= new Date()) {
              await ctx.answerCbQuery(messages.predictAlreadyStarted[lang]);
              return;
            }
          }

          // Save prediction
          await this.quinielaService.savePrediction(
            quiniela._id.toString(),
            user._id.toString(),
            {
              matchId,
              simplePrediction: outcome, // 'home', 'draw', 'away'
            }
          );

          // Format outcome for display
          let predictionText = outcome;
          if (match) {
            const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
            const awayTeam = this.queriesService.getTeamById(match.awayTeamId);
            const homeFlag = this.countryCodeToFlag(homeTeam?.flag || '');
            const awayFlag = this.countryCodeToFlag(awayTeam?.flag || '');
            if (outcome === 'home') predictionText = `${homeFlag} ${homeTeam?.name[lang] || match.homeTeamId}`;
            else if (outcome === 'away') predictionText = `${awayFlag} ${awayTeam?.name[lang] || match.awayTeamId}`;
            else predictionText = messages.predictDraw[lang];
          }

          await ctx.answerCbQuery('✅');
          await ctx.editMessageText(
            messages.predictSaved[lang](predictionText),
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          this.logger.error('Error saving prediction', error);
          await ctx.answerCbQuery(messages.predictError[lang]);
        }
        return;
      }

      // Handle back to matches: back:predict:CODE
      if (data.startsWith('back:predict:')) {
        const code = data.replace('back:predict:', '');
        const quiniela = await this.quinielaModel.findOne({ code }).exec();

        if (quiniela) {
          await ctx.answerCbQuery();
          await this.showMatchesForPrediction(ctx, quiniela, user._id.toString(), lang, true);
        }
        return;
      }

      // Handle exact score selection: score:CODE:MATCHID:SELECTING:VALUE:HOME:AWAY
      if (data.startsWith('score:')) {
        const parts = data.split(':');
        const code = parts[1];
        const matchId = parts[2];
        const selecting = parts[3] as 'home' | 'away';
        const value = parseInt(parts[4], 10);
        let homeScore = parseInt(parts[5], 10);
        let awayScore = parseInt(parts[6], 10);

        // Update the score being selected
        if (selecting === 'home') {
          homeScore = value;
        } else {
          awayScore = value;
        }

        const quiniela = await this.quinielaModel.findOne({ code }).exec();
        if (!quiniela) {
          await ctx.answerCbQuery(messages.rankingNotFound[lang]);
          return;
        }

        // Switch to other team selection
        const nextSelecting = selecting === 'home' ? 'away' : 'home';
        await this.showExactScoreInput(ctx, quiniela, matchId, lang, homeScore, awayScore, nextSelecting);
        return;
      }

      // Handle exact score confirmation: scoreconfirm:CODE:MATCHID:HOME:AWAY
      if (data.startsWith('scoreconfirm:')) {
        const parts = data.split(':');
        const code = parts[1];
        const matchId = parts[2];
        const homeScore = parseInt(parts[3], 10);
        const awayScore = parseInt(parts[4], 10);

        try {
          const quiniela = await this.quinielaModel.findOne({ code }).exec();
          if (!quiniela) {
            await ctx.answerCbQuery(messages.rankingNotFound[lang]);
            return;
          }

          // Check if match has already started
          const match = this.queriesService.getMatchById(matchId);
          if (match) {
            const matchTime = new Date(match.dateTimeUTC);
            if (matchTime <= new Date()) {
              await ctx.answerCbQuery(messages.predictAlreadyStarted[lang]);
              return;
            }
          }

          // Determine simple outcome from exact score
          let simplePrediction: 'home' | 'draw' | 'away';
          if (homeScore > awayScore) simplePrediction = 'home';
          else if (awayScore > homeScore) simplePrediction = 'away';
          else simplePrediction = 'draw';

          // Save prediction with exact score
          await this.quinielaService.savePrediction(
            quiniela._id.toString(),
            user._id.toString(),
            {
              matchId,
              simplePrediction,
              homeScore,
              awayScore,
            }
          );

          const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
          const awayTeam = this.queriesService.getTeamById(match.awayTeamId);
          const homeName = homeTeam?.name[lang] || match.homeTeamId;
          const awayName = awayTeam?.name[lang] || match.awayTeamId;

          await ctx.answerCbQuery('✅');
          await ctx.editMessageText(
            messages.predictScoreSaved[lang](homeScore, awayScore, homeName, awayName),
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          this.logger.error('Error saving exact score prediction', error);
          await ctx.answerCbQuery(messages.predictError[lang]);
        }
        return;
      }

      // Handle switch to exact score mode: exactscore:CODE:MATCHID
      if (data.startsWith('exactscore:')) {
        const parts = data.split(':');
        const code = parts[1];
        const matchId = parts[2];

        const quiniela = await this.quinielaModel.findOne({ code }).exec();
        if (!quiniela) {
          await ctx.answerCbQuery(messages.rankingNotFound[lang]);
          return;
        }

        await this.showExactScoreInput(ctx, quiniela, matchId, lang, 0, 0, 'home');
        return;
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

  // ============ PREDICTION METHODS ============

  private async showMatchesForPrediction(
    ctx: any,
    quiniela: QuinielaDocument,
    userId: string,
    lang: Lang,
    editMessage = false
  ) {
    // Get upcoming matches (next 5)
    const upcomingMatches = this.queriesService.getUpcomingMatches(5);

    if (!upcomingMatches || upcomingMatches.length === 0) {
      const text = `📊 *${quiniela.name}*\n\n${messages.predictNoMatches[lang]}`;
      if (editMessage) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(text, { parse_mode: 'Markdown' });
      }
      return;
    }

    // Get user's existing predictions for this quiniela
    const member = quiniela.members.find(m => m.userId.toString() === userId);
    const existingPredictions = member?.predictions || [];

    // Build match buttons
    const buttons = upcomingMatches.map(match => {
      const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
      const awayTeam = this.queriesService.getTeamById(match.awayTeamId);

      const homeName = homeTeam?.name[lang] || match.homeTeamId;
      const awayName = awayTeam?.name[lang] || match.awayTeamId;
      const homeFlag = this.countryCodeToFlag(homeTeam?.flag || '');
      const awayFlag = this.countryCodeToFlag(awayTeam?.flag || '');

      // Check if already predicted
      const prediction = existingPredictions.find(p => p.matchId === match.id);
      const checkMark = prediction ? ' ✅' : '';

      // Format date
      const matchDate = new Date(match.dateTimeUTC);
      const dateStr = matchDate.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });

      return [
        Markup.button.callback(
          `${homeFlag} ${homeName} vs ${awayName} ${awayFlag} (${dateStr})${checkMark}`,
          `predict:${quiniela.code}:match:${match.id}`
        )
      ];
    });

    const text = messages.predictSelectMatch[lang](quiniela.name);

    if (editMessage) {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    } else {
      await ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      });
    }
  }

  private async showPredictionOptions(
    ctx: any,
    quiniela: QuinielaDocument,
    matchId: string,
    lang: Lang
  ) {
    const match = this.queriesService.getMatchById(matchId);
    if (!match) {
      await ctx.answerCbQuery(messages.rankingNotFound[lang]);
      return;
    }

    // Check if match has started
    const matchTime = new Date(match.dateTimeUTC);
    if (matchTime <= new Date()) {
      await ctx.answerCbQuery(messages.predictAlreadyStarted[lang]);
      return;
    }

    const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId);

    const homeName = homeTeam?.name[lang] || match.homeTeamId;
    const awayName = awayTeam?.name[lang] || match.awayTeamId;
    const homeFlag = this.countryCodeToFlag(homeTeam?.flag || '');
    const awayFlag = this.countryCodeToFlag(awayTeam?.flag || '');

    // Format date
    const dateStr = matchTime.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const text = messages.predictForMatch[lang](`${homeFlag} ${homeName}`, `${awayName} ${awayFlag}`, dateStr);

    const buttons = [
      [Markup.button.callback(messages.predictHome[lang](`${homeFlag} ${homeName}`), `pred:${quiniela.code}:${matchId}:home`)],
      [Markup.button.callback(messages.predictDraw[lang], `pred:${quiniela.code}:${matchId}:draw`)],
      [Markup.button.callback(messages.predictAway[lang](`${awayFlag} ${awayName}`), `pred:${quiniela.code}:${matchId}:away`)],
    ];

    // Add exact score option
    buttons.push([
      Markup.button.callback(
        lang === 'es' ? '🎯 Marcador exacto' : '🎯 Exact score',
        `exactscore:${quiniela.code}:${matchId}`
      )
    ]);

    buttons.push([Markup.button.callback(messages.predictBack[lang], `back:predict:${quiniela.code}`)]);

    await ctx.answerCbQuery();
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Convert country code to flag emoji
   * e.g., "mx" → "🇲🇽", "us" → "🇺🇸"
   */
  private countryCodeToFlag(code: string): string {
    if (!code || code.length < 2) return '🏳️';

    // Handle special cases
    const specialFlags: Record<string, string> = {
      'gb-eng': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      'gb-sct': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      'gb-wls': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
      'un': '🇺🇳',
    };

    const lowerCode = code.toLowerCase();
    if (specialFlags[lowerCode]) {
      return specialFlags[lowerCode];
    }

    // Convert 2-letter code to flag emoji using regional indicator symbols
    const firstLetter = lowerCode.charCodeAt(0) - 97 + 0x1F1E6;
    const secondLetter = lowerCode.charCodeAt(1) - 97 + 0x1F1E6;

    return String.fromCodePoint(firstLetter, secondLetter);
  }

  // ============ PRE-MATCH NOTIFICATIONS ============

  /**
   * Cron job: Check for matches starting in ~2 hours and notify users
   * Runs every 30 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkUpcomingMatchesForNotifications() {
    if (!this.bot) return;

    this.logger.log('Checking for upcoming matches to send notifications...');

    try {
      // Get matches starting in 1.5 to 2.5 hours (30 min window around 2h mark)
      const now = new Date();
      const minTime = new Date(now.getTime() + 90 * 60 * 1000); // 1.5 hours
      const maxTime = new Date(now.getTime() + 150 * 60 * 1000); // 2.5 hours

      const upcomingMatches = this.queriesService.getUpcomingMatches(20);
      const matchesToNotify = upcomingMatches.filter(match => {
        const matchTime = new Date(match.dateTimeUTC);
        return matchTime >= minTime && matchTime <= maxTime;
      });

      if (matchesToNotify.length === 0) {
        this.logger.debug('No matches in 2-hour notification window');
        return;
      }

      this.logger.log(`Found ${matchesToNotify.length} matches to notify about`);

      // Get all quinielas and their members
      const quinielas = await this.quinielaModel.find({ status: 'open' }).exec();

      for (const match of matchesToNotify) {
        for (const quiniela of quinielas) {
          await this.sendMatchNotifications(match, quiniela);
        }
      }
    } catch (error) {
      this.logger.error('Error in notification cron job', error);
    }
  }

  /**
   * Send notifications to quiniela members who haven't predicted a match
   */
  private async sendMatchNotifications(match: any, quiniela: QuinielaDocument) {
    const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId);

    for (const member of quiniela.members) {
      // Check if user has already predicted this match
      const hasPredicted = member.predictions?.some(p => p.matchId === match.id);
      if (hasPredicted) continue;

      // Get user's Telegram platform link
      const platformLink = await this.platformLinkModel.findOne({
        userId: member.userId,
        platform: Platform.TELEGRAM,
      }).exec();

      if (!platformLink) continue;

      // Get user's language preference (default to Spanish)
      const user = await this.userModel.findById(member.userId).exec();
      const lang: Lang = 'es'; // Default, could store user preference

      const homeFlag = this.countryCodeToFlag(homeTeam?.flag || '');
      const awayFlag = this.countryCodeToFlag(awayTeam?.flag || '');
      const homeName = homeTeam?.name[lang] || match.homeTeamId;
      const awayName = awayTeam?.name[lang] || match.awayTeamId;

      const matchTime = new Date(match.dateTimeUTC);
      const timeStr = matchTime.toLocaleTimeString(lang === 'es' ? 'es-MX' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      try {
        await this.bot.telegram.sendMessage(
          platformLink.platformUserId,
          messages.notificationMatchSoon[lang](
            `${homeFlag} ${homeName}`,
            `${awayName} ${awayFlag}`,
            timeStr,
            quiniela.name
          ),
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(messages.notificationPredictNow[lang], `predict:${quiniela.code}:match:${match.id}`)]
            ])
          }
        );

        this.logger.debug(`Sent notification to ${member.userName} for match ${match.id}`);
      } catch (error) {
        // User may have blocked the bot
        this.logger.debug(`Failed to notify user ${member.userId}: ${error.message}`);
      }
    }
  }

  // ============ MATCH RESULTS & POINTS ============

  /**
   * Send match result to all users who predicted
   * Called by external service when a match ends
   */
  async sendMatchResult(matchId: string, homeScore: number, awayScore: number) {
    if (!this.bot) return;

    const match = this.queriesService.getMatchById(matchId);
    if (!match) {
      this.logger.warn(`Match ${matchId} not found for result notification`);
      return;
    }

    const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId);

    // Determine actual outcome
    let actualOutcome: 'home' | 'draw' | 'away';
    if (homeScore > awayScore) actualOutcome = 'home';
    else if (awayScore > homeScore) actualOutcome = 'away';
    else actualOutcome = 'draw';

    // Get all quinielas
    const quinielas = await this.quinielaModel.find({ status: 'open' }).exec();

    for (const quiniela of quinielas) {
      for (const member of quiniela.members) {
        const prediction = member.predictions?.find(p => p.matchId === matchId);
        if (!prediction) continue;

        // Get user's Telegram platform link
        const platformLink = await this.platformLinkModel.findOne({
          userId: member.userId,
          platform: Platform.TELEGRAM,
        }).exec();

        if (!platformLink) continue;

        const lang: Lang = 'es';
        const homeFlag = this.countryCodeToFlag(homeTeam?.flag || '');
        const awayFlag = this.countryCodeToFlag(awayTeam?.flag || '');
        const homeName = homeTeam?.name[lang] || match.homeTeamId;
        const awayName = awayTeam?.name[lang] || match.awayTeamId;

        // Calculate points - Check exact score FIRST, then simple prediction
        let points = 0;
        let pointsMessage = '';

        if (prediction.homeScore !== undefined && prediction.awayScore !== undefined) {
          // Exact score prediction - check exact match first
          if (prediction.homeScore === homeScore && prediction.awayScore === awayScore) {
            points = 3; // Exact score match!
            pointsMessage = messages.matchResultPoints[lang](points);
          } else {
            // Check if outcome matches (partial credit)
            let predictedOutcome: 'home' | 'draw' | 'away';
            if (prediction.homeScore > prediction.awayScore) predictedOutcome = 'home';
            else if (prediction.awayScore > prediction.homeScore) predictedOutcome = 'away';
            else predictedOutcome = 'draw';

            if (predictedOutcome === actualOutcome) {
              points = 1; // Correct outcome but wrong score
              pointsMessage = messages.matchResultPoints[lang](points);
            } else {
              pointsMessage = messages.matchResultNoPoints[lang];
            }
          }
        } else if (prediction.simplePrediction === actualOutcome) {
          // Simple prediction - just outcome
          points = 1;
          pointsMessage = messages.matchResultPoints[lang](points);
        } else {
          pointsMessage = messages.matchResultNoPoints[lang];
        }

        // Format prediction text
        let predictionText: string;
        if (prediction.homeScore !== undefined && prediction.awayScore !== undefined) {
          predictionText = `${homeName} ${prediction.homeScore} - ${prediction.awayScore} ${awayName}`;
        } else if (prediction.simplePrediction === 'home') {
          predictionText = `${homeFlag} ${homeName}`;
        } else if (prediction.simplePrediction === 'away') {
          predictionText = `${awayFlag} ${awayName}`;
        } else {
          predictionText = messages.predictDraw[lang];
        }

        const resultMessage = `${messages.matchResultTitle[lang](`${homeFlag} ${homeName}`, `${awayName} ${awayFlag}`)}\n\n${messages.matchResultScore[lang](homeScore, awayScore)}\n\n${messages.matchResultYourPrediction[lang](predictionText)}\n${pointsMessage}`;

        try {
          await this.bot.telegram.sendMessage(
            platformLink.platformUserId,
            resultMessage,
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          this.logger.debug(`Failed to send result to user ${member.userId}: ${error.message}`);
        }
      }
    }
  }

  // ============ EXACT SCORE PREDICTION ============

  /**
   * Show exact score input keyboard
   */
  private async showExactScoreInput(
    ctx: any,
    quiniela: QuinielaDocument,
    matchId: string,
    lang: Lang,
    currentHomeScore = 0,
    currentAwayScore = 0,
    selecting: 'home' | 'away' = 'home'
  ) {
    const match = this.queriesService.getMatchById(matchId);
    if (!match) return;

    const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId);
    const homeFlag = this.countryCodeToFlag(homeTeam?.flag || '');
    const awayFlag = this.countryCodeToFlag(awayTeam?.flag || '');
    const homeName = homeTeam?.name[lang] || match.homeTeamId;
    const awayName = awayTeam?.name[lang] || match.awayTeamId;

    const currentScore = `${homeName} ${currentHomeScore} - ${currentAwayScore} ${awayName}`;
    const selectingTeam = selecting === 'home'
      ? messages.predictScoreHome[lang](`${homeFlag} ${homeName}`)
      : messages.predictScoreAway[lang](`${awayFlag} ${awayName}`);

    const text = `${messages.predictExactScore[lang]}\n\n📊 ${currentScore}\n\n${selectingTeam}`;

    // Score buttons 0-6
    const scoreButtons = [];
    for (let i = 0; i <= 6; i++) {
      scoreButtons.push(
        Markup.button.callback(
          `${i}`,
          `score:${quiniela.code}:${matchId}:${selecting}:${i}:${currentHomeScore}:${currentAwayScore}`
        )
      );
    }

    const buttons = [
      scoreButtons,
      [
        Markup.button.callback(
          `✅ ${lang === 'es' ? 'Confirmar' : 'Confirm'} (${currentHomeScore}-${currentAwayScore})`,
          `scoreconfirm:${quiniela.code}:${matchId}:${currentHomeScore}:${currentAwayScore}`
        )
      ],
      [Markup.button.callback(messages.predictBack[lang], `back:predict:${quiniela.code}`)],
    ];

    await ctx.answerCbQuery();
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  // ============ TEST HELPERS ============

  /**
   * Get upcoming matches for testing (exposes match IDs)
   */
  getUpcomingMatchesForTest() {
    const matches = this.queriesService.getUpcomingMatches(10);
    return matches.map(match => {
      const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
      const awayTeam = this.queriesService.getTeamById(match.awayTeamId);
      return {
        matchId: match.id,
        homeTeam: homeTeam?.name.es || match.homeTeamId,
        awayTeam: awayTeam?.name.es || match.awayTeamId,
        dateTimeUTC: match.dateTimeUTC,
        stage: match.stage,
      };
    });
  }

  /**
   * Send a direct message to a Telegram user (for testing)
   */
  async sendDirectMessage(telegramId: string, message: string) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }
    await this.bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' });
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
