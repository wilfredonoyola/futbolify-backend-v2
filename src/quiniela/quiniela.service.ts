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
} from './schemas/quiniela.schema';
import {
  CreateQuinielaInput,
  SavePredictionInput,
  QuinielaInvite,
  QuinielaPublicInfo,
  LeaderboardEntry,
  ClaimQuinielaInput,
} from './dto/quiniela.dto';

@Injectable()
export class QuinielaService {
  constructor(
    @InjectModel(Quiniela.name)
    private quinielaModel: Model<QuinielaDocument>,
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
      ownerId: userId ? new Types.ObjectId(userId) : undefined,
      ownerName,
      anonymousCreatorId: isAnonymous ? input.anonymousCreatorId : undefined,
      isPrivate: input.isPrivate,
      description: input.description,
      imageUrl: input.imageUrl,
      status: QuinielaStatus.OPEN,
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
      inviteUrl: `https://futbolify.com/es/donde-ver/mundial-2026/q/${quiniela.code}`,
      memberCount: quiniela.memberCount,
      isPrivate: quiniela.isPrivate,
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
      inviteUrl: `https://futbolify.com/es/donde-ver/mundial-2026/q/${quiniela.code}`,
      memberCount: quiniela.memberCount,
      isPrivate: quiniela.isPrivate,
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
      ownerName: quiniela.ownerName,
      memberCount: quiniela.memberCount,
      isPrivate: quiniela.isPrivate,
      status: quiniela.status,
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

  // Delete quiniela (owner only)
  async deleteQuiniela(quinielaId: string, userId: string): Promise<boolean> {
    const quiniela = await this.quinielaModel.findById(quinielaId);
    if (!quiniela) {
      throw new NotFoundException('Quiniela not found');
    }

    if (quiniela.ownerId.toString() !== userId) {
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
}
