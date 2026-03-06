// Quiniela Resolver - GraphQL endpoints for prediction pools

import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { QuinielaService } from './quiniela.service';
import { Quiniela, QuinielaMember } from './schemas/quiniela.schema';
import {
  CreateQuinielaInput,
  UpdateQuinielaInput,
  SavePredictionInput,
  SavePredictionsInput,
  QuinielaInvite,
  QuinielaPublicInfo,
  LeaderboardEntry,
  ClaimQuinielaInput,
} from './dto/quiniela.dto';

// Note: In a real implementation, you would add proper auth guards
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Resolver()
export class QuinielaResolver {
  constructor(private readonly quinielaService: QuinielaService) {}

  // ============ PUBLIC QUERIES ============

  @Query(() => QuinielaPublicInfo, { name: 'quinielaByCode', nullable: true })
  async getQuinielaByCode(
    @Args('code') code: string,
  ): Promise<QuinielaPublicInfo | null> {
    return this.quinielaService.getByCode(code);
  }

  // ============ AUTHENTICATED QUERIES ============

  @Query(() => [Quiniela], { name: 'myQuinielas' })
  async getMyQuinielas(
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<Quiniela[]> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      return [];
    }
    return this.quinielaService.getMyQuinielas(userId);
  }

  @Query(() => Quiniela, { name: 'quiniela', nullable: true })
  async getQuiniela(
    @Args('id') id: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<Quiniela | null> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      return null;
    }
    return this.quinielaService.getById(id, userId);
  }

  @Query(() => [LeaderboardEntry], { name: 'quinielaLeaderboard' })
  async getLeaderboard(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<LeaderboardEntry[]> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      return [];
    }
    return this.quinielaService.getLeaderboard(quinielaId, userId);
  }

  @Query(() => QuinielaMember, { name: 'myQuinielaPredictions', nullable: true })
  async getMyPredictions(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<QuinielaMember | null> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      return null;
    }
    return this.quinielaService.getMemberPredictions(quinielaId, userId);
  }

  // ============ MUTATIONS ============

  @Mutation(() => QuinielaInvite, { name: 'createQuiniela' })
  async createQuiniela(
    @Args('input') input: CreateQuinielaInput,
    @Context() context: { req?: { user?: { userId?: string; username?: string } } },
  ): Promise<QuinielaInvite> {
    const userId = context.req?.user?.userId;
    const userName = context.req?.user?.username;

    // Allow anonymous creation if anonymousCreatorId is provided
    if (!userId && !input.anonymousCreatorId) {
      throw new Error('Either authentication or anonymousCreatorId is required');
    }

    return this.quinielaService.createQuiniela(input, userId, userName);
  }

  @Mutation(() => QuinielaInvite, { name: 'claimQuiniela' })
  async claimQuiniela(
    @Args('input') input: ClaimQuinielaInput,
    @Context() context: { req?: { user?: { userId?: string; name?: string; avatarUrl?: string } } },
  ): Promise<QuinielaInvite> {
    const userId = context.req?.user?.userId;
    const userName = context.req?.user?.name || 'Usuario';
    const avatarUrl = context.req?.user?.avatarUrl;

    if (!userId) {
      throw new Error('Authentication required to claim a quiniela');
    }

    return this.quinielaService.claimQuiniela(input, userId, userName, avatarUrl);
  }

  @Query(() => [Quiniela], { name: 'anonymousQuinielas' })
  async getAnonymousQuinielas(
    @Args('anonymousCreatorId') anonymousCreatorId: string,
  ): Promise<Quiniela[]> {
    return this.quinielaService.getAnonymousQuinielasByCreator(anonymousCreatorId);
  }

  @Mutation(() => QuinielaMember, { name: 'joinQuiniela' })
  async joinQuiniela(
    @Args('code') code: string,
    @Context() context: { req?: { user?: { userId?: string; name?: string; avatarUrl?: string } } },
  ): Promise<QuinielaMember> {
    const userId = context.req?.user?.userId;
    const userName = context.req?.user?.name || 'Usuario';
    const avatarUrl = context.req?.user?.avatarUrl;

    if (!userId) {
      throw new Error('Authentication required to join a quiniela');
    }

    return this.quinielaService.joinQuiniela(code, userId, userName, avatarUrl);
  }

  @Mutation(() => Boolean, { name: 'leaveQuiniela' })
  async leaveQuiniela(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<boolean> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.leaveQuiniela(quinielaId, userId);
  }

  @Mutation(() => QuinielaMember, { name: 'savePrediction' })
  async savePrediction(
    @Args('quinielaId') quinielaId: string,
    @Args('input') input: SavePredictionInput,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<QuinielaMember> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.savePrediction(quinielaId, userId, input);
  }

  @Mutation(() => QuinielaMember, { name: 'savePredictions' })
  async savePredictions(
    @Args('quinielaId') quinielaId: string,
    @Args('input') input: SavePredictionsInput,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<QuinielaMember> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.savePredictions(quinielaId, userId, input.predictions);
  }

  @Mutation(() => QuinielaMember, { name: 'saveChampionPick' })
  async saveChampionPick(
    @Args('quinielaId') quinielaId: string,
    @Args('teamId') teamId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<QuinielaMember> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.saveChampionPick(quinielaId, userId, teamId);
  }

  @Mutation(() => Quiniela, { name: 'updateQuiniela' })
  async updateQuiniela(
    @Args('quinielaId') quinielaId: string,
    @Args('input') input: UpdateQuinielaInput,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<Quiniela> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.updateQuiniela(quinielaId, userId, input);
  }

  @Mutation(() => Boolean, { name: 'deleteQuiniela' })
  async deleteQuiniela(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<boolean> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.deleteQuiniela(quinielaId, userId);
  }

  // ============ ADMIN OPERATIONS ============

  @Mutation(() => Boolean, { name: 'removeMember' })
  async removeMember(
    @Args('quinielaId') quinielaId: string,
    @Args('memberId') memberId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<boolean> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.removeMember(quinielaId, userId, memberId);
  }

  @Query(() => QuinielaMember, { name: 'memberPredictions', nullable: true })
  async getMemberPredictionsById(
    @Args('quinielaId') quinielaId: string,
    @Args('memberId') memberId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<QuinielaMember | null> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      return null;
    }
    return this.quinielaService.getMemberPredictionsById(quinielaId, userId, memberId);
  }

  @Query(() => Boolean, { name: 'isQuinielaOwner' })
  async isQuinielaOwner(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<boolean> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      return false;
    }
    return this.quinielaService.isOwner(quinielaId, userId);
  }
}
