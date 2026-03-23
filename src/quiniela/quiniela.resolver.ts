// Quiniela Resolver - GraphQL endpoints for prediction pools

import { Resolver, Query, Mutation, Args, Context, InputType, Field } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUserPayload } from '../auth/current-user-payload.interface';
import { GqlOptionalAuthGuard } from '../auth/gql-optional-auth.guard';
import { QuinielaService } from './quiniela.service';
import { QuinielaAIService } from './quiniela-ai.service';
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
  SetAdminEmailInput,
  SetAdminEmailResult,
  VerifyAdminEmailInput,
  VerifyAdminEmailResult,
  ValidateAdminTokenInput,
  ValidateAdminTokenResult,
  SetQuinielaOfficialInput,
  AIPrediction,
  AIScoreData,
  PaginatedPublicPools,
} from './dto/quiniela.dto';
import { QuinielaStatus } from './schemas/quiniela.schema';

// Input for AI predictions batch request
@InputType()
export class MatchInfoInput {
  @Field()
  matchId: string;

  @Field()
  homeTeamCode: string;

  @Field()
  awayTeamCode: string;

  @Field()
  homeTeamId: string;

  @Field()
  awayTeamId: string;
}

// Note: In a real implementation, you would add proper auth guards
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Resolver()
export class QuinielaResolver {
  constructor(
    private readonly quinielaService: QuinielaService,
    private readonly quinielaAIService: QuinielaAIService,
  ) {}

  // ============ PUBLIC QUERIES ============

  @Query(() => QuinielaPublicInfo, { name: 'quinielaByCode', nullable: true })
  async getQuinielaByCode(
    @Args('code') code: string,
  ): Promise<QuinielaPublicInfo | null> {
    return this.quinielaService.getByCode(code);
  }

  // ============ OFFICIAL QUINIELAS (PUBLIC) ============

  @Query(() => [Quiniela], { name: 'officialQuinielas' })
  async getOfficialQuinielas(): Promise<Quiniela[]> {
    return this.quinielaService.getOfficialQuinielas();
  }

  @Query(() => Quiniela, { name: 'officialQuiniela', nullable: true })
  async getOfficialQuiniela(
    @Args('tournamentSlug') tournamentSlug: string,
  ): Promise<Quiniela | null> {
    return this.quinielaService.getOfficialQuinielaBySlug(tournamentSlug);
  }

  // Discover public pools for exploration (optional auth to exclude user's pools)
  @Query(() => PaginatedPublicPools, { name: 'discoverPublicPools' })
  @UseGuards(GqlOptionalAuthGuard)
  async discoverPublicPools(
    @Context() context: { req?: { user?: { userId?: string } } },
    @Args('leagueId', { nullable: true }) leagueId?: string,
    @Args('search', { nullable: true }) search?: string,
    @Args('status', { nullable: true, type: () => QuinielaStatus }) status?: QuinielaStatus,
    @Args('limit', { nullable: true, defaultValue: 20 }) limit?: number,
    @Args('offset', { nullable: true, defaultValue: 0 }) offset?: number,
    @Args('sortBy', { nullable: true, defaultValue: 'createdAt' }) sortBy?: string,
  ): Promise<PaginatedPublicPools> {
    const userId = context.req?.user?.userId;
    return this.quinielaService.discoverPublicPools({
      leagueId,
      search,
      status,
      limit,
      offset,
      sortBy: sortBy as 'createdAt' | 'memberCount',
      excludeUserId: userId, // Exclude pools where user is owner or member
    });
  }

  // ============ AUTHENTICATED QUERIES ============

  @Query(() => [Quiniela], { name: 'myQuinielas' })
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlOptionalAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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
  @UseGuards(GqlAuthGuard)
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

  // ============ OFFICIAL QUINIELAS ADMIN ============

  @Mutation(() => Quiniela, { name: 'setQuinielaOfficial' })
  @UseGuards(GqlAuthGuard)
  async setQuinielaOfficial(
    @Args('input') input: SetQuinielaOfficialInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Quiniela> {
    // username is the email in our auth system
    const userEmail = user.username;
    if (!userEmail) {
      throw new Error('Authentication required');
    }
    return this.quinielaService.setQuinielaOfficial(
      input.quinielaId,
      input.isOfficial,
      userEmail,
    );
  }

  // ============ ADMIN EMAIL FLOW ============

  @Mutation(() => SetAdminEmailResult, { name: 'setQuinielaAdminEmail' })
  async setAdminEmail(
    @Args('input') input: SetAdminEmailInput,
  ): Promise<SetAdminEmailResult> {
    return this.quinielaService.setAdminEmail(input);
  }

  @Mutation(() => VerifyAdminEmailResult, { name: 'verifyQuinielaAdminEmail' })
  async verifyAdminEmail(
    @Args('input') input: VerifyAdminEmailInput,
  ): Promise<VerifyAdminEmailResult> {
    return this.quinielaService.verifyAdminEmail(input);
  }

  @Query(() => ValidateAdminTokenResult, { name: 'validateQuinielaAdminToken' })
  async validateAdminToken(
    @Args('input') input: ValidateAdminTokenInput,
  ): Promise<ValidateAdminTokenResult> {
    return this.quinielaService.validateAdminToken(input);
  }

  @Mutation(() => SetAdminEmailResult, { name: 'regenerateQuinielaAdminToken' })
  async regenerateAdminToken(
    @Args('code') code: string,
    @Args('email') email: string,
  ): Promise<SetAdminEmailResult> {
    return this.quinielaService.regenerateAdminToken(code, email);
  }

  // ============ AI PREDICTIONS ============

  @Query(() => [AIPrediction], { name: 'aiPredictionsForMatches' })
  async getAIPredictionsForMatches(
    @Args('matches', { type: () => [MatchInfoInput] }) matches: MatchInfoInput[],
    @Args('locale', { nullable: true, defaultValue: 'es' }) locale: string,
  ): Promise<AIPrediction[]> {
    return this.quinielaAIService.getAIPredictionsForMatches(
      matches,
      locale as 'es' | 'en',
    );
  }

  @Query(() => AIPrediction, { name: 'aiPredictionForMatch', nullable: true })
  async getAIPredictionForMatch(
    @Args('matchId') matchId: string,
    @Args('homeTeamCode') homeTeamCode: string,
    @Args('awayTeamCode') awayTeamCode: string,
    @Args('homeTeamId') homeTeamId: string,
    @Args('awayTeamId') awayTeamId: string,
    @Args('locale', { nullable: true, defaultValue: 'es' }) locale: string,
  ): Promise<AIPrediction> {
    return this.quinielaAIService.getAIPrediction(
      matchId,
      homeTeamCode,
      awayTeamCode,
      homeTeamId,
      awayTeamId,
      locale as 'es' | 'en',
    );
  }

  @Query(() => AIScoreData, { name: 'myAIScore' })
  @UseGuards(GqlAuthGuard)
  async getMyAIScore(
    @Args('quinielaId') quinielaId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<AIScoreData> {
    const userId = context.req?.user?.userId;
    if (!userId) {
      return {
        userCorrect: 0,
        aiCorrect: 0,
        userExact: 0,
        aiExact: 0,
        totalMatches: 0,
        streak: { type: 'none', count: 0 },
      };
    }
    return this.quinielaAIService.getAIScore(quinielaId, userId);
  }

  @Mutation(() => Boolean, { name: 'evaluateMatchResult' })
  async evaluateMatchResult(
    @Args('matchId') matchId: string,
    @Args('homeScore') homeScore: number,
    @Args('awayScore') awayScore: number,
  ): Promise<boolean> {
    await this.quinielaAIService.evaluateMatchResult(matchId, homeScore, awayScore);
    return true;
  }
}
