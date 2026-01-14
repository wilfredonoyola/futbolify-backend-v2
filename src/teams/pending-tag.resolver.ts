import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PendingTagService } from './pending-tag.service';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUserPayload } from '../auth/current-user-payload.interface';
import { PendingTag } from './schemas/pending-tag.schema';
import { CreatePendingTagInput, PendingTagOutput } from './dto';

@Resolver(() => PendingTag)
export class PendingTagResolver {
  constructor(private readonly pendingTagService: PendingTagService) {}

  // ============== QUERIES ==============

  @Query(() => [PendingTag], { name: 'pendingTags' })
  @UseGuards(GqlAuthGuard)
  async getPendingTags(
    @Args('mediaId', { type: () => ID }) mediaId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<PendingTag[]> {
    return this.pendingTagService.getPendingTags(mediaId, user.userId);
  }

  @Query(() => [PendingTag], { name: 'teamPendingInvitations' })
  @UseGuards(GqlAuthGuard)
  async getTeamPendingInvitations(
    @Args('teamId', { type: () => ID }) teamId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<PendingTag[]> {
    return this.pendingTagService.getTeamPendingInvitations(teamId, user.userId);
  }

  @Query(() => [PendingTag], { name: 'myPendingTags' })
  @UseGuards(GqlAuthGuard)
  async getMyPendingTags(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<PendingTag[]> {
    // Get user's phone from their profile
    // For now, we'll use the phone from the user payload if available
    // This requires extending the CurrentUserPayload to include phone
    return this.pendingTagService.getMyPendingTags(user.phone || '');
  }

  @Query(() => PendingTag, { name: 'pendingTagByCode', nullable: true })
  async getPendingTagByCode(
    @Args('inviteCode') inviteCode: string,
  ): Promise<PendingTag | null> {
    // This is a public query - no auth required
    return this.pendingTagService.getPendingTagByCode(inviteCode);
  }

  // ============== MUTATIONS ==============

  @Mutation(() => PendingTag)
  @UseGuards(GqlAuthGuard)
  async createPendingTag(
    @Args('input') input: CreatePendingTagInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<PendingTag> {
    return this.pendingTagService.createPendingTag(user.userId, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async cancelPendingTag(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.pendingTagService.cancelPendingTag(id, user.userId);
  }

  @Mutation(() => PendingTag)
  @UseGuards(GqlAuthGuard)
  async claimPendingTag(
    @Args('inviteCode') inviteCode: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<PendingTag> {
    return this.pendingTagService.claimPendingTagByCode(user.userId, inviteCode);
  }

  @Mutation(() => Boolean, { description: 'Claim all pending tags by phone number (called after registration)' })
  @UseGuards(GqlAuthGuard)
  async claimPendingTagsByPhone(
    @Args('phone') phone: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    const count = await this.pendingTagService.claimPendingTagsByPhone(user.userId, phone);
    return count > 0;
  }
}
