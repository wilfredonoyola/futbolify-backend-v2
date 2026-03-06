// Quiniela Resolver - GraphQL endpoints for prediction pools

import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { QuinielaService } from './quiniela.service';
import { Quiniela, QuinielaMember } from './schemas/quiniela.schema';
import {
  CreateQuinielaInput,
  SavePredictionInput,
  SavePredictionsInput,
  QuinielaInvite,
  QuinielaPublicInfo,
  LeaderboardEntry,
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
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<Quiniela[]> {
    const userId = context.req?.user?._id;
    if (!userId) {
      return [];
    }
    return this.quinielaService.getMyQuinielas(userId);
  }

  @Query(() => Quiniela, { name: 'quiniela', nullable: true })
  async getQuiniela(
    @Args('id') id: string,
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<Quiniela | null> {
    const userId = context.req?.user?._id;
    if (!userId) {
      return null;
    }
    return this.quinielaService.getById(id, userId);
  }

  @Query(() => [LeaderboardEntry], { name: 'quinielaLeaderboard' })
  async getLeaderboard(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<LeaderboardEntry[]> {
    const userId = context.req?.user?._id;
    if (!userId) {
      return [];
    }
    return this.quinielaService.getLeaderboard(quinielaId, userId);
  }

  @Query(() => QuinielaMember, { name: 'myQuinielaPredictions', nullable: true })
  async getMyPredictions(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<QuinielaMember | null> {
    const userId = context.req?.user?._id;
    if (!userId) {
      return null;
    }
    return this.quinielaService.getMemberPredictions(quinielaId, userId);
  }

  // ============ MUTATIONS ============

  @Mutation(() => QuinielaInvite, { name: 'createQuiniela' })
  async createQuiniela(
    @Args('input') input: CreateQuinielaInput,
    @Context() context: { req?: { user?: { _id?: string; name?: string } } },
  ): Promise<QuinielaInvite> {
    const userId = context.req?.user?._id;
    const userName = context.req?.user?.name || 'Usuario';

    if (!userId) {
      throw new Error('Authentication required to create a quiniela');
    }

    return this.quinielaService.createQuiniela(input, userId, userName);
  }

  @Mutation(() => QuinielaMember, { name: 'joinQuiniela' })
  async joinQuiniela(
    @Args('code') code: string,
    @Context() context: { req?: { user?: { _id?: string; name?: string; avatarUrl?: string } } },
  ): Promise<QuinielaMember> {
    const userId = context.req?.user?._id;
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
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<boolean> {
    const userId = context.req?.user?._id;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.leaveQuiniela(quinielaId, userId);
  }

  @Mutation(() => QuinielaMember, { name: 'savePrediction' })
  async savePrediction(
    @Args('quinielaId') quinielaId: string,
    @Args('input') input: SavePredictionInput,
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<QuinielaMember> {
    const userId = context.req?.user?._id;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.savePrediction(quinielaId, userId, input);
  }

  @Mutation(() => QuinielaMember, { name: 'savePredictions' })
  async savePredictions(
    @Args('quinielaId') quinielaId: string,
    @Args('input') input: SavePredictionsInput,
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<QuinielaMember> {
    const userId = context.req?.user?._id;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.savePredictions(quinielaId, userId, input.predictions);
  }

  @Mutation(() => QuinielaMember, { name: 'saveChampionPick' })
  async saveChampionPick(
    @Args('quinielaId') quinielaId: string,
    @Args('teamId') teamId: string,
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<QuinielaMember> {
    const userId = context.req?.user?._id;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.saveChampionPick(quinielaId, userId, teamId);
  }

  @Mutation(() => Boolean, { name: 'deleteQuiniela' })
  async deleteQuiniela(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<boolean> {
    const userId = context.req?.user?._id;
    if (!userId) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.deleteQuiniela(quinielaId, userId);
  }
}
