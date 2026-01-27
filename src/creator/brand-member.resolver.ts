import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BrandMemberService } from './brand-member.service';
import { Brand } from './schemas/brand.schema';
import { BrandMember, BrandMemberRole } from './schemas/brand-member.schema';
import {
  InviteToBrandInput,
  JoinBrandInput,
  UpdateBrandMemberRoleInput,
  BrandMemberWithUser,
  BrandInvitationResult,
  BrandPublicInfo,
  BrandInvitationInfo,
} from './dto/brand-member.dto';

@Resolver()
export class BrandMemberResolver {
  constructor(private readonly brandMemberService: BrandMemberService) {}

  // ============== QUERIES ==============

  /**
   * Get all members of a brand
   */
  @Query(() => [BrandMemberWithUser])
  @UseGuards(GqlAuthGuard)
  async brandMembers(
    @CurrentUser() user: any,
    @Args('brandId', { type: () => ID }) brandId: string,
  ): Promise<BrandMemberWithUser[]> {
    return this.brandMemberService.getBrandMembers(user.userId, brandId);
  }

  /**
   * Get all pending invitations for a brand
   */
  @Query(() => [BrandInvitationInfo])
  @UseGuards(GqlAuthGuard)
  async brandInvitations(
    @CurrentUser() user: any,
    @Args('brandId', { type: () => ID }) brandId: string,
  ): Promise<BrandInvitationInfo[]> {
    return this.brandMemberService.getBrandInvitations(user.userId, brandId);
  }

  /**
   * Get brand public info by invite code (no auth required)
   */
  @Query(() => BrandPublicInfo)
  async brandByInviteCode(
    @Args('code') code: string,
  ): Promise<BrandPublicInfo> {
    return this.brandMemberService.getBrandByInviteCode(code);
  }

  /**
   * Get current user's role in a brand
   */
  @Query(() => BrandMemberRole, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async myBrandRole(
    @CurrentUser() user: any,
    @Args('brandId', { type: () => ID }) brandId: string,
  ): Promise<BrandMemberRole | null> {
    return this.brandMemberService.getMyBrandRole(user.userId, brandId);
  }

  // ============== MUTATIONS ==============

  /**
   * Create an invitation to join a brand (Owner only)
   */
  @Mutation(() => BrandInvitationResult)
  @UseGuards(GqlAuthGuard)
  async inviteToBrand(
    @CurrentUser() user: any,
    @Args('input') input: InviteToBrandInput,
  ): Promise<BrandInvitationResult> {
    return this.brandMemberService.createInvitation(user.userId, input);
  }

  /**
   * Join a brand using an invitation code
   */
  @Mutation(() => Brand)
  @UseGuards(GqlAuthGuard)
  async joinBrand(
    @CurrentUser() user: any,
    @Args('input') input: JoinBrandInput,
  ): Promise<Brand> {
    return this.brandMemberService.joinBrand(user.userId, input);
  }

  /**
   * Update a member's role (Owner only)
   */
  @Mutation(() => BrandMemberWithUser)
  @UseGuards(GqlAuthGuard)
  async updateBrandMemberRole(
    @CurrentUser() user: any,
    @Args('input') input: UpdateBrandMemberRoleInput,
  ): Promise<BrandMemberWithUser> {
    return this.brandMemberService.updateMemberRole(user.userId, input);
  }

  /**
   * Remove a member from a brand (Owner only)
   */
  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async removeBrandMember(
    @CurrentUser() user: any,
    @Args('brandId', { type: () => ID }) brandId: string,
    @Args('userId', { type: () => ID }) memberUserId: string,
  ): Promise<boolean> {
    return this.brandMemberService.removeMember(user.userId, brandId, memberUserId);
  }

  /**
   * Leave a brand (for non-owners)
   */
  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async leaveBrand(
    @CurrentUser() user: any,
    @Args('brandId', { type: () => ID }) brandId: string,
  ): Promise<boolean> {
    return this.brandMemberService.leaveBrand(user.userId, brandId);
  }

  /**
   * Revoke a pending invitation (Owner only)
   */
  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async revokeBrandInvitation(
    @CurrentUser() user: any,
    @Args('invitationId', { type: () => ID }) invitationId: string,
  ): Promise<boolean> {
    return this.brandMemberService.revokeInvitation(user.userId, invitationId);
  }
}
