// Telegram Service - Handles user management and bot operations

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { Message } from 'telegraf/types';

import { PlatformLink, PlatformLinkDocument, Platform } from './schemas/platform-link.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Quiniela, QuinielaDocument, QuinielaMember } from '../quiniela/schemas/quiniela.schema';

// Types for Telegram context
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
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
export class TelegramService {
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

  // ============ CORE: ENSURE USER (Zero Friction Registration) ============

  /**
   * Creates or retrieves a user based on platform identity.
   * This is the core of the ghost user system - no registration required.
   */
  async ensureUser(input: EnsureUserInput): Promise<EnsureUserResult> {
    // Check if platform link already exists
    const existingLink = await this.platformLinkModel.findOne({
      platform: input.platform,
      platformUserId: input.platformUserId,
    }).exec();

    if (existingLink) {
      // User already exists - return them
      const user = await this.userModel.findById(existingLink.userId).exec();
      if (!user) {
        throw new Error('User not found for existing platform link');
      }
      return { user, platformLink: existingLink, isNew: false };
    }

    // Create new ghost user
    const userName = this.generateUserName(input.displayName, input.platformUserId);

    const newUser = await this.userModel.create({
      userName,
      name: input.displayName,
      avatarUrl: input.avatarUrl,
      isGhostUser: true,
      isOnboardingCompleted: true, // Ghost users don't need onboarding
      roles: ['USER'],
    });

    // Create platform link
    const platformLink = await this.platformLinkModel.create({
      userId: newUser._id,
      platform: input.platform,
      platformUserId: input.platformUserId,
      platformUsername: input.platformUsername,
      platformGroupId: input.platformGroupId,
    });

    this.logger.log(`Created ghost user ${newUser._id} for ${input.platform}:${input.platformUserId}`);

    return { user: newUser, platformLink, isNew: true };
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
    // /start - Welcome message
    this.bot.start(async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);

      await ctx.reply(
        `¡Hola ${user.name}! 👋\n\n` +
        `Soy el bot de Futbolify para quinielas del Mundial 2026 ⚽🏆\n\n` +
        `Comandos disponibles:\n` +
        `/crear [nombre] - Crear una quiniela\n` +
        `/unirse [código] - Unirse a una quiniela\n` +
        `/predecir - Hacer predicciones\n` +
        `/ranking - Ver el leaderboard\n` +
        `/partidos - Próximos partidos\n` +
        `/misquinielas - Ver tus quinielas`,
        { parse_mode: 'HTML' }
      );
    });

    // /crear - Create quiniela
    this.bot.command('crear', async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

      if (!args) {
        return ctx.reply('❌ Debes indicar el nombre de la quiniela.\n\nEjemplo: /crear Mi Quiniela del Mundial');
      }

      try {
        const quiniela = await this.createQuiniela(args, user._id.toString(), user.name || user.userName);

        await ctx.reply(
          `✅ ¡Quiniela creada!\n\n` +
          `📋 *${quiniela.name}*\n` +
          `🔑 Código: \`${quiniela.code}\`\n\n` +
          `Comparte este enlace para invitar:\n` +
          `https://futbolify.com/q/${quiniela.code}`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        this.logger.error('Error creating quiniela', error);
        await ctx.reply('❌ Error al crear la quiniela. Intenta de nuevo.');
      }
    });

    // /unirse - Join quiniela
    this.bot.command('unirse', async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const code = ctx.message.text.split(' ')[1]?.trim().toUpperCase();

      if (!code) {
        return ctx.reply('❌ Debes indicar el código de la quiniela.\n\nEjemplo: /unirse ABC123');
      }

      try {
        const result = await this.joinQuiniela(code, user._id.toString(), user.name || user.userName, user.avatarUrl);

        await ctx.reply(
          `✅ ¡Te uniste a la quiniela!\n\n` +
          `📋 *${result.quinielaName}*\n` +
          `👥 ${result.memberCount} participantes\n\n` +
          `Usa /predecir para hacer tus predicciones.`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        this.logger.error('Error joining quiniela', error);
        await ctx.reply(`❌ ${error.message || 'Error al unirse a la quiniela'}`);
      }
    });

    // /predecir - Show matches with prediction buttons
    this.bot.command('predecir', async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);

      // Get user's quinielas first
      const quinielas = await this.getUserQuinielas(user._id.toString());

      if (quinielas.length === 0) {
        return ctx.reply(
          '❌ No estás en ninguna quiniela.\n\n' +
          'Usa /crear para crear una o /unirse para unirte a una existente.'
        );
      }

      // For now, show a message - matches will come from worldcup module
      await ctx.reply(
        `📊 Tienes ${quinielas.length} quiniela(s):\n\n` +
        quinielas.map((q, i) => `${i + 1}. ${q.name} (${q.code})`).join('\n') +
        '\n\n🔜 Próximamente podrás predecir directamente aquí.',
        { parse_mode: 'HTML' }
      );
    });

    // /ranking - Show leaderboard
    this.bot.command('ranking', async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const code = ctx.message.text.split(' ')[1]?.trim().toUpperCase();

      // Get user's quinielas
      const quinielas = await this.getUserQuinielas(user._id.toString());

      if (quinielas.length === 0) {
        return ctx.reply('❌ No estás en ninguna quiniela.');
      }

      // If code provided, show that quiniela's ranking
      const quiniela = code
        ? quinielas.find(q => q.code === code)
        : quinielas[0]; // Default to first quiniela

      if (!quiniela) {
        return ctx.reply('❌ Quiniela no encontrada.');
      }

      const leaderboard = this.formatLeaderboard(quiniela);

      await ctx.reply(
        `🏆 *Ranking: ${quiniela.name}*\n\n${leaderboard}`,
        { parse_mode: 'Markdown' }
      );
    });

    // /misquinielas - List user's quinielas
    this.bot.command('misquinielas', async (ctx) => {
      const { user } = await this.ensureUserFromContext(ctx);
      const quinielas = await this.getUserQuinielas(user._id.toString());

      if (quinielas.length === 0) {
        return ctx.reply(
          '📭 No tienes quinielas aún.\n\n' +
          'Usa /crear para crear una o /unirse para unirte.'
        );
      }

      const list = quinielas.map((q, i) => {
        const member = q.members.find(m => m.userId.toString() === user._id.toString());
        const rank = member?.rank || '-';
        const points = member?.totalPoints || 0;
        return `${i + 1}. *${q.name}*\n   📊 #${rank} | ${points} pts | 👥 ${q.memberCount}`;
      }).join('\n\n');

      await ctx.reply(
        `📋 *Tus Quinielas:*\n\n${list}`,
        { parse_mode: 'Markdown' }
      );
    });

    // /partidos - Upcoming matches
    this.bot.command('partidos', async (ctx) => {
      // This will integrate with worldcup module
      await ctx.reply(
        '⚽ *Próximos Partidos*\n\n' +
        '🔜 Esta función estará disponible cuando comience el Mundial 2026.\n\n' +
        'Por ahora, puedes crear o unirte a quinielas para estar listo.',
        { parse_mode: 'Markdown' }
      );
    });

    // Handle callback queries (for inline buttons)
    this.bot.on('callback_query', async (ctx) => {
      const data = (ctx.callbackQuery as { data?: string }).data;
      if (!data) return;

      // Handle prediction callbacks: pred:matchId:outcome
      if (data.startsWith('pred:')) {
        const [, matchId, outcome] = data.split(':');
        const { user } = await this.ensureUserFromContext(ctx);

        // TODO: Submit prediction via quiniela service
        await ctx.answerCbQuery(`✅ Predicción guardada: ${outcome}`);
        await ctx.editMessageText(`✅ Predicción registrada para partido ${matchId}`);
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

    if (!quiniela) {
      throw new Error('Quiniela no encontrada. Verifica el código.');
    }

    const userId = new Types.ObjectId(odUserId);

    // Check if already a member
    const isMember = quiniela.members.some(m => m.userId.toString() === odUserId);
    if (isMember) {
      throw new Error('Ya eres miembro de esta quiniela.');
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

  private formatLeaderboard(quiniela: QuinielaDocument): string {
    const medals = ['🥇', '🥈', '🥉'];

    const sorted = [...quiniela.members]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 10);

    if (sorted.length === 0) {
      return 'Sin participantes aún.';
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
