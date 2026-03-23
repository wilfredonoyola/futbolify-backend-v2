// Quiniela Service - Business logic for prediction pools

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Quiniela,
  QuinielaDocument,
  QuinielaMember,
  QuinielaStatus,
  PredictionMode,
} from './schemas/quiniela.schema';
import {
  CreateQuinielaInput,
  SavePredictionInput,
  QuinielaInvite,
  QuinielaPublicInfo,
  LeaderboardEntry,
  ClaimQuinielaInput,
  SetAdminEmailInput,
  SetAdminEmailResult,
  VerifyAdminEmailInput,
  VerifyAdminEmailResult,
  ValidateAdminTokenInput,
  ValidateAdminTokenResult,
  PaginatedPublicPools,
} from './dto/quiniela.dto';
import { EmailService } from '../email/email.service';
import * as crypto from 'crypto';

@Injectable()
export class QuinielaService {
  constructor(
    @InjectModel(Quiniela.name)
    private quinielaModel: Model<QuinielaDocument>,
    private emailService: EmailService,
  ) {}

  // Generate unique invite code
  private generateCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  // Create a new quiniela (supports both authenticated and anonymous)
  async createQuiniela(
    input: CreateQuinielaInput,
    userId?: string,
    userName?: string,
  ): Promise<QuinielaInvite> {
    const code = this.generateCode();
    const isAnonymous = !userId;

    // Determine owner name
    const ownerName = userName || input.ownerName || 'Anónimo';

    // For authenticated users, create owner as first member
    const members: Partial<QuinielaMember>[] = [];
    if (userId) {
      members.push({
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(userId),
        userName: ownerName,
        predictions: [],
        totalPoints: 0,
        correctPredictions: 0,
        exactScores: 0,
        joinedAt: new Date(),
      });
    }

    const quiniela = new this.quinielaModel({
      name: input.name,
      code,
      leagueId: input.leagueId,
      ownerId: userId ? new Types.ObjectId(userId) : undefined,
      ownerName,
      anonymousCreatorId: isAnonymous ? input.anonymousCreatorId : undefined,
      isPrivate: input.isPrivate,
      description: input.description,
      imageUrl: input.imageUrl,
      status: QuinielaStatus.OPEN,
      predictionMode: input.predictionMode || PredictionMode.SIMPLE,
      rules: {
        exactScore: 5,
        correctResult: 2,
        bonusChampion: 10,
      },
      members,
      memberCount: members.length,
    });

    await quiniela.save();

    return {
      quinielaId: quiniela._id.toString(),
      quinielaName: quiniela.name,
      ownerName: quiniela.ownerName,
      code: quiniela.code,
      inviteUrl: `https://futbolify.com/q/${quiniela.code}`,
      memberCount: quiniela.memberCount,
      isPrivate: quiniela.isPrivate,
      leagueId: quiniela.leagueId,
      isAnonymous,
      anonymousCreatorId: isAnonymous ? input.anonymousCreatorId : undefined,
    };
  }

  // Claim an anonymous quiniela (when user creates account)
  async claimQuiniela(
    input: ClaimQuinielaInput,
    userId: string,
    userName: string,
    avatarUrl?: string,
  ): Promise<QuinielaInvite> {
    const quiniela = await this.quinielaModel.findOne({
      code: input.code.toUpperCase(),
    });

    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    // Verify this is an anonymous quiniela
    if (quiniela.ownerId) {
      throw new ForbiddenException('This quiniela already has an owner');
    }

    // Verify the anonymous creator ID matches
    if (quiniela.anonymousCreatorId !== input.anonymousCreatorId) {
      throw new ForbiddenException('Invalid anonymous creator ID');
    }

    // Claim the quiniela
    quiniela.ownerId = new Types.ObjectId(userId);
    quiniela.ownerName = userName;
    quiniela.claimedAt = new Date();

    // Add owner as first member
    const ownerMember: Partial<QuinielaMember> = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      userName,
      avatarUrl,
      predictions: [],
      totalPoints: 0,
      correctPredictions: 0,
      exactScores: 0,
      joinedAt: new Date(),
    };

    quiniela.members.unshift(ownerMember as QuinielaMember);
    quiniela.memberCount = quiniela.members.length;

    await quiniela.save();

    return {
      quinielaId: quiniela._id.toString(),
      quinielaName: quiniela.name,
      ownerName: quiniela.ownerName,
      code: quiniela.code,
      inviteUrl: `https://futbolify.com/q/${quiniela.code}`,
      memberCount: quiniela.memberCount,
      isPrivate: quiniela.isPrivate,
      leagueId: quiniela.leagueId,
      isAnonymous: false,
    };
  }

  // Get anonymous quinielas by creator ID (for migration on login)
  async getAnonymousQuinielasByCreator(
    anonymousCreatorId: string,
  ): Promise<Quiniela[]> {
    return this.quinielaModel.find({
      anonymousCreatorId,
      ownerId: { $exists: false },
    });
  }

  // Get quiniela by code (public info)
  async getByCode(code: string): Promise<QuinielaPublicInfo | null> {
    const quiniela = await this.quinielaModel.findOne({ code: code.toUpperCase() });
    if (!quiniela) return null;

    return {
      id: quiniela._id.toString(),
      name: quiniela.name,
      ownerId: quiniela.ownerId?.toString(),
      ownerName: quiniela.ownerName,
      memberCount: quiniela.memberCount,
      isPrivate: quiniela.isPrivate,
      isOfficial: quiniela.isOfficial || false,
      tournamentSlug: quiniela.tournamentSlug,
      leagueId: quiniela.leagueId,
      status: quiniela.status,
      predictionMode: quiniela.predictionMode || PredictionMode.SIMPLE,
      description: quiniela.description,
      imageUrl: quiniela.imageUrl,
      createdAt: quiniela.createdAt,
    };
  }

  // Get full quiniela by ID (for members)
  async getById(quinielaId: string, userId: string): Promise<Quiniela> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    // Check if user is a member
    const isMember = quiniela.members.some(
      (m) => m.userId.toString() === userId,
    );
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this quiniela');
    }

    return quiniela;
  }

  // Get user's quinielas
  async getMyQuinielas(userId: string): Promise<Quiniela[]> {
    return this.quinielaModel
      .find({ 'members.userId': new Types.ObjectId(userId) })
      .sort({ createdAt: -1 });
  }

  // Join a quiniela
  async joinQuiniela(
    code: string,
    userId: string,
    userName: string,
    avatarUrl?: string,
  ): Promise<QuinielaMember> {
    const quiniela = await this.quinielaModel.findOne({ code: code.toUpperCase() });
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    if (quiniela.status !== QuinielaStatus.OPEN) {
      throw new ForbiddenException('This quiniela is no longer accepting new members');
    }

    // Check if already a member
    const existingMember = quiniela.members.find(
      (m) => m.userId.toString() === userId,
    );
    if (existingMember) {
      throw new ConflictException('You are already a member of this quiniela');
    }

    // Add new member
    const newMember: Partial<QuinielaMember> = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      userName,
      avatarUrl,
      predictions: [],
      totalPoints: 0,
      correctPredictions: 0,
      exactScores: 0,
      joinedAt: new Date(),
    };

    quiniela.members.push(newMember as QuinielaMember);
    quiniela.memberCount = quiniela.members.length;
    await quiniela.save();

    return newMember as QuinielaMember;
  }

  // Leave a quiniela
  async leaveQuiniela(quinielaId: string, userId: string): Promise<boolean> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    // Owner cannot leave
    if (quiniela.ownerId.toString() === userId) {
      throw new ForbiddenException('Owner cannot leave the quiniela. Delete it instead.');
    }

    // Remove member
    const memberIndex = quiniela.members.findIndex(
      (m) => m.userId.toString() === userId,
    );
    if (memberIndex === -1) {
      throw new NotFoundException('You are not a member of this quiniela');
    }

    quiniela.members.splice(memberIndex, 1);
    quiniela.memberCount = quiniela.members.length;
    await quiniela.save();

    return true;
  }

  // Save a prediction
  async savePrediction(
    quinielaId: string,
    userId: string,
    input: SavePredictionInput,
  ): Promise<QuinielaMember> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    // Find member
    const member = quiniela.members.find(
      (m) => m.userId.toString() === userId,
    );
    if (!member) {
      throw new ForbiddenException('You are not a member of this quiniela');
    }

    // Check if quiniela is still accepting predictions
    if (quiniela.status === QuinielaStatus.CLOSED) {
      throw new ForbiddenException('This quiniela is closed for predictions');
    }

    // Update or add prediction
    const existingPredictionIndex = member.predictions.findIndex(
      (p) => p.matchId === input.matchId,
    );

    const prediction = {
      matchId: input.matchId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      simplePrediction: input.simplePrediction,
      submittedAt: new Date(),
    };

    if (existingPredictionIndex >= 0) {
      member.predictions[existingPredictionIndex] = prediction;
    } else {
      member.predictions.push(prediction);
    }

    await quiniela.save();
    return member;
  }

  // Save multiple predictions
  async savePredictions(
    quinielaId: string,
    userId: string,
    predictions: SavePredictionInput[],
  ): Promise<QuinielaMember> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    // Find member
    const member = quiniela.members.find(
      (m) => m.userId.toString() === userId,
    );
    if (!member) {
      throw new ForbiddenException('You are not a member of this quiniela');
    }

    if (quiniela.status === QuinielaStatus.CLOSED) {
      throw new ForbiddenException('This quiniela is closed for predictions');
    }

    // Update all predictions
    for (const input of predictions) {
      const existingIndex = member.predictions.findIndex(
        (p) => p.matchId === input.matchId,
      );

      const prediction = {
        matchId: input.matchId,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        simplePrediction: input.simplePrediction,
        submittedAt: new Date(),
      };

      if (existingIndex >= 0) {
        member.predictions[existingIndex] = prediction;
      } else {
        member.predictions.push(prediction);
      }
    }

    await quiniela.save();
    return member;
  }

  // Save champion pick
  async saveChampionPick(
    quinielaId: string,
    userId: string,
    teamId: string,
  ): Promise<QuinielaMember> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    const member = quiniela.members.find(
      (m) => m.userId.toString() === userId,
    );
    if (!member) {
      throw new ForbiddenException('You are not a member of this quiniela');
    }

    member.championPick = teamId;
    await quiniela.save();

    return member;
  }

  // Get leaderboard
  async getLeaderboard(quinielaId: string, userId: string): Promise<LeaderboardEntry[]> {
    const quiniela = await this.getById(quinielaId, userId);

    // Sort members by points, then by exact scores
    const sortedMembers = [...quiniela.members].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return b.exactScores - a.exactScores;
    });

    return sortedMembers.map((member, index) => ({
      rank: index + 1,
      memberId: member._id.toString(),
      userId: member.userId.toString(),
      userName: member.userName,
      avatarUrl: member.avatarUrl,
      totalPoints: member.totalPoints,
      correctPredictions: member.correctPredictions,
      exactScores: member.exactScores,
      championPick: member.championPick,
    }));
  }

  // Update quiniela (owner only)
  async updateQuiniela(
    quinielaId: string,
    userId: string,
    updates: { name?: string; description?: string; isPrivate?: boolean; imageUrl?: string },
  ): Promise<Quiniela> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    if (quiniela.ownerId?.toString() !== userId) {
      throw new ForbiddenException('Only the owner can update this quiniela');
    }

    // Apply updates
    if (updates.name !== undefined) quiniela.name = updates.name;
    if (updates.description !== undefined) quiniela.description = updates.description;
    if (updates.isPrivate !== undefined) quiniela.isPrivate = updates.isPrivate;
    if (updates.imageUrl !== undefined) quiniela.imageUrl = updates.imageUrl;

    await quiniela.save();
    return quiniela;
  }

  // Delete quiniela (owner only)
  async deleteQuiniela(quinielaId: string, userId: string): Promise<boolean> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    if (quiniela.ownerId?.toString() !== userId) {
      throw new ForbiddenException('Only the owner can delete this quiniela');
    }

    await quiniela.deleteOne();
    return true;
  }

  // Get member's predictions for a quiniela
  async getMemberPredictions(
    quinielaId: string,
    userId: string,
    targetUserId?: string,
  ): Promise<QuinielaMember | null> {
    const quiniela = await this.getById(quinielaId, userId);

    const lookupUserId = targetUserId || userId;
    const member = quiniela.members.find(
      (m) => m.userId.toString() === lookupUserId,
    );

    return member || null;
  }

  // Get member predictions by memberId (for admin viewing)
  async getMemberPredictionsById(
    quinielaId: string,
    userId: string,
    memberId: string,
  ): Promise<QuinielaMember | null> {
    const quiniela = await this.getById(quinielaId, userId);

    const member = quiniela.members.find(
      (m) => m._id.toString() === memberId,
    );

    return member || null;
  }

  // Remove a member from quiniela (owner only)
  async removeMember(
    quinielaId: string,
    userId: string,
    memberId: string,
  ): Promise<boolean> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    // Only owner can remove members
    if (quiniela.ownerId?.toString() !== userId) {
      throw new ForbiddenException('Only the owner can remove members');
    }

    // Find the member
    const memberIndex = quiniela.members.findIndex(
      (m) => m._id.toString() === memberId,
    );
    if (memberIndex === -1) {
      throw new NotFoundException('Member not found');
    }

    // Cannot remove yourself (use delete quiniela instead)
    if (quiniela.members[memberIndex].userId.toString() === userId) {
      throw new ForbiddenException('Cannot remove yourself. Delete the quiniela instead.');
    }

    // Remove member
    quiniela.members.splice(memberIndex, 1);
    quiniela.memberCount = quiniela.members.length;
    await quiniela.save();

    return true;
  }

  // Check if user is owner
  async isOwner(quinielaId: string, userId: string): Promise<boolean> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) return false;
    return quiniela.ownerId?.toString() === userId;
  }

  // ============ ADMIN EMAIL FLOW ============

  // Generate a 6-digit verification code
  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Generate a secure admin token (32 chars)
  private generateAdminToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  // Hash an admin token for storage
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Set admin email for anonymous quiniela (sends verification code)
  async setAdminEmail(input: SetAdminEmailInput): Promise<SetAdminEmailResult> {
    const quiniela = await this.quinielaModel.findOne({
      code: input.code.toUpperCase(),
    });

    if (!quiniela) {
      throw new NotFoundException('Quiniela no encontrada');
    }

    // Verify this is an anonymous quiniela
    if (quiniela.ownerId) {
      throw new ForbiddenException('Esta quiniela ya tiene un propietario');
    }

    // Verify the anonymous creator ID matches
    if (quiniela.anonymousCreatorId !== input.anonymousCreatorId) {
      throw new ForbiddenException('ID de creador anónimo inválido');
    }

    // Generate verification code
    const verificationCode = this.generateVerificationCode();

    // Update quiniela with pending email and verification code
    quiniela.adminEmail = input.email.toLowerCase();
    quiniela.verificationCode = verificationCode;
    quiniela.verificationCodeCreatedAt = new Date();
    quiniela.emailVerified = false;

    await quiniela.save();

    // Send verification email with code
    await this.emailService.sendQuinielaVerificationCode(
      input.email,
      verificationCode,
      quiniela.name,
    );

    return {
      success: true,
      message: `Código de verificación enviado a ${input.email}`,
    };
  }

  // Verify admin email with code and generate admin token
  async verifyAdminEmail(input: VerifyAdminEmailInput): Promise<VerifyAdminEmailResult> {
    const quiniela = await this.quinielaModel.findOne({
      code: input.code.toUpperCase(),
    });

    if (!quiniela) {
      throw new NotFoundException('Quiniela no encontrada');
    }

    // Check if there's a pending verification
    if (!quiniela.verificationCode || !quiniela.verificationCodeCreatedAt) {
      throw new ForbiddenException('No hay verificación pendiente');
    }

    // Check if verification code expired (10 minutes)
    const codeAge = Date.now() - quiniela.verificationCodeCreatedAt.getTime();
    const tenMinutes = 10 * 60 * 1000;
    if (codeAge > tenMinutes) {
      throw new ForbiddenException('El código de verificación ha expirado');
    }

    // Verify the code
    if (quiniela.verificationCode !== input.verificationCode) {
      throw new ForbiddenException('Código de verificación incorrecto');
    }

    // Generate admin token
    const adminToken = this.generateAdminToken();
    const hashedToken = this.hashToken(adminToken);

    // Update quiniela
    quiniela.emailVerified = true;
    quiniela.adminToken = hashedToken;
    quiniela.adminTokenCreatedAt = new Date();
    quiniela.verificationCode = undefined;
    quiniela.verificationCodeCreatedAt = undefined;

    await quiniela.save();

    const adminUrl = `https://futbolify.com/quiniela/${quiniela.code}/admin?token=${adminToken}`;

    // Send admin link email for future reference
    await this.emailService.sendQuinielaAdminLink(
      quiniela.adminEmail,
      adminUrl,
      quiniela.name,
    );

    return {
      success: true,
      message: 'Email verificado correctamente',
      adminToken,
      adminUrl,
    };
  }

  // Validate admin token (for magic link access)
  async validateAdminToken(input: ValidateAdminTokenInput): Promise<ValidateAdminTokenResult> {
    const quiniela = await this.quinielaModel.findOne({
      code: input.code.toUpperCase(),
    });

    if (!quiniela) {
      return {
        isValid: false,
        message: 'Quiniela no encontrada',
      };
    }

    // Check if there's an admin token
    if (!quiniela.adminToken || !quiniela.adminTokenCreatedAt) {
      return {
        isValid: false,
        message: 'Esta quiniela no tiene acceso de administrador configurado',
      };
    }

    // Check if token expired (30 days)
    const tokenAge = Date.now() - quiniela.adminTokenCreatedAt.getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (tokenAge > thirtyDays) {
      return {
        isValid: false,
        message: 'El token de administrador ha expirado',
      };
    }

    // Verify the token
    const hashedInput = this.hashToken(input.token);
    if (quiniela.adminToken !== hashedInput) {
      return {
        isValid: false,
        message: 'Token de administrador inválido',
      };
    }

    return {
      isValid: true,
      quinielaId: quiniela._id.toString(),
      quinielaName: quiniela.name,
    };
  }

  // Regenerate admin token (when expired or lost)
  async regenerateAdminToken(code: string, email: string): Promise<SetAdminEmailResult> {
    const quiniela = await this.quinielaModel.findOne({
      code: code.toUpperCase(),
      adminEmail: email.toLowerCase(),
      emailVerified: true,
    });

    if (!quiniela) {
      throw new NotFoundException('Quiniela no encontrada o email no coincide');
    }

    // Generate new verification code (user needs to verify again)
    const verificationCode = this.generateVerificationCode();

    quiniela.verificationCode = verificationCode;
    quiniela.verificationCodeCreatedAt = new Date();

    await quiniela.save();

    // Send verification email
    await this.emailService.sendQuinielaVerificationCode(
      email,
      verificationCode,
      quiniela.name,
    );

    return {
      success: true,
      message: `Código de verificación enviado a ${email}`,
    };
  }

  // Merge anonymous quinielas when user creates Cognito account with same email
  async mergeQuinielasOnSignup(email: string, userId: string, userName: string): Promise<number> {
    // Find all anonymous quinielas with this verified email
    const quinielas = await this.quinielaModel.find({
      adminEmail: email.toLowerCase(),
      emailVerified: true,
      ownerId: { $exists: false },
    });

    let mergedCount = 0;

    for (const quiniela of quinielas) {
      // Claim the quiniela
      quiniela.ownerId = new Types.ObjectId(userId);
      quiniela.ownerName = userName;
      quiniela.claimedAt = new Date();

      // Add owner as first member if not already
      const isAlreadyMember = quiniela.members.some(
        (m) => m.userId.toString() === userId,
      );

      if (!isAlreadyMember) {
        const ownerMember: Partial<QuinielaMember> = {
          _id: new Types.ObjectId(),
          userId: new Types.ObjectId(userId),
          userName,
          predictions: [],
          totalPoints: 0,
          correctPredictions: 0,
          exactScores: 0,
          joinedAt: new Date(),
        };

        quiniela.members.unshift(ownerMember as QuinielaMember);
        quiniela.memberCount = quiniela.members.length;
      }

      await quiniela.save();
      mergedCount++;
    }

    return mergedCount;
  }

  // ============ OFFICIAL QUINIELAS ============

  // Admin email allowed to manage official quinielas
  private readonly OFFICIAL_ADMIN_EMAIL = 'wilfredon163@gmail.com';

  // Get all official quinielas
  async getOfficialQuinielas(): Promise<Quiniela[]> {
    return this.quinielaModel.find({ isOfficial: true }).sort({ createdAt: -1 });
  }

  // Get official quiniela by tournament slug
  async getOfficialQuinielaBySlug(tournamentSlug: string): Promise<Quiniela | null> {
    return this.quinielaModel.findOne({
      isOfficial: true,
      tournamentSlug: tournamentSlug.toLowerCase(),
    });
  }

  // Set quiniela as official (admin only - wilfredon163@gmail.com)
  // Note: tournamentSlug is derived from the quiniela's leagueId (already saved during creation)
  async setQuinielaOfficial(
    quinielaId: string,
    isOfficial: boolean,
    userEmail: string,
  ): Promise<Quiniela> {
    // Check if user is authorized
    if (userEmail.toLowerCase() !== this.OFFICIAL_ADMIN_EMAIL) {
      throw new ForbiddenException('Only Futbolify admin can manage official quinielas');
    }

    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    // Use leagueId as the tournament slug (already saved during quiniela creation)
    const tournamentSlug = quiniela.leagueId;

    // Check if another quiniela already has this tournament slug as official
    if (isOfficial) {
      const existing = await this.quinielaModel.findOne({
        tournamentSlug: tournamentSlug.toLowerCase(),
        isOfficial: true,
        _id: { $ne: quiniela._id },
      });
      if (existing) {
        throw new ConflictException(`Ya existe una quiniela oficial para "${tournamentSlug}"`);
      }
    }

    // Update quiniela
    quiniela.isOfficial = isOfficial;
    quiniela.tournamentSlug = isOfficial ? tournamentSlug.toLowerCase() : undefined;

    // Official quinielas should always be public
    if (isOfficial) {
      quiniela.isPrivate = false;
    }

    await quiniela.save();
    return quiniela;
  }

  // ============ USER RANKING POINTS ============

  // Get total ranking points for a user across all quinielas
  async getTotalUserPoints(userId: string): Promise<number> {
    const result = await this.quinielaModel.aggregate([
      { $unwind: '$members' },
      { $match: { 'members.userId': new Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$members.totalPoints' } } },
    ]);
    return result[0]?.total ?? 0;
  }

  // ============ DISCOVER PUBLIC POOLS ============

  // Discover public pools for exploration (excludes user's own pools)
  async discoverPublicPools(options: {
    leagueId?: string;
    search?: string;
    status?: QuinielaStatus;
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'memberCount';
    excludeUserId?: string; // Exclude pools where user is owner or member
  }): Promise<PaginatedPublicPools> {
    const { leagueId, search, status, limit = 20, offset = 0, sortBy = 'createdAt', excludeUserId } = options;

    // Build query filter - only public pools
    const filter: any = { isPrivate: false };
    if (leagueId) filter.leagueId = leagueId;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Exclude pools where user is owner or member
    if (excludeUserId) {
      filter.ownerId = { $ne: new Types.ObjectId(excludeUserId) };
      filter['members.userId'] = { $ne: new Types.ObjectId(excludeUserId) };
    }

    // Build sort - both should be descending (newest or most popular first)
    const sort: any = {};
    sort[sortBy] = -1;

    // Execute query
    const [pools, total] = await Promise.all([
      this.quinielaModel.find(filter).sort(sort).skip(offset).limit(limit),
      this.quinielaModel.countDocuments(filter),
    ]);

    return {
      pools: pools.map(q => ({
        id: q._id.toString(),
        name: q.name,
        ownerId: q.ownerId?.toString() || null,
        ownerName: q.ownerName || 'Anonymous',
        memberCount: q.memberCount || 0,
        isPrivate: q.isPrivate,
        isOfficial: q.isOfficial || false,
        tournamentSlug: q.tournamentSlug,
        leagueId: q.leagueId,
        status: q.status || QuinielaStatus.OPEN,
        predictionMode: q.predictionMode || PredictionMode.SIMPLE,
        description: q.description,
        imageUrl: q.imageUrl,
        createdAt: q.createdAt,
      })),
      total,
      hasMore: offset + pools.length < total,
    };
  }
}
