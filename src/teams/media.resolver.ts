import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MediaService } from './media.service';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUserPayload } from '../auth/current-user-payload.interface';
import { Media, MediaType } from './schemas/media.schema';
import { UploadMediaInput, UpdateMediaInput, MediaFiltersInput, ProfileStats } from './dto';

@Resolver(() => Media)
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  // ============== QUERIES ==============

  @Query(() => [Media], { name: 'matchMedia' })
  @UseGuards(GqlAuthGuard)
  async getMatchMedia(
    @Args('matchId', { type: () => ID }) matchId: string,
    @Args('filters', { type: () => MediaFiltersInput, nullable: true }) filters: MediaFiltersInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media[]> {
    return this.mediaService.getMatchMedia(matchId, user.userId, filters);
  }

  @Query(() => Media, { name: 'media' })
  @UseGuards(GqlAuthGuard)
  async getMedia(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media> {
    return this.mediaService.getMedia(id, user.userId);
  }

  @Query(() => [Media], { name: 'myTaggedMedia' })
  @UseGuards(GqlAuthGuard)
  async getMyTaggedMedia(
    @Args('type', { type: () => String, nullable: true }) type: MediaType,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media[]> {
    return this.mediaService.getMyTaggedMedia(user.userId, type);
  }

  @Query(() => ProfileStats, { name: 'profileStats' })
  @UseGuards(GqlAuthGuard)
  async getProfileStats(
    @Args('userId', { type: () => ID, nullable: true }) targetUserId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProfileStats> {
    const userId = targetUserId || user.userId;
    return this.mediaService.getProfileStats(userId);
  }

  // ============== MUTATIONS ==============

  @Mutation(() => Media)
  @UseGuards(GqlAuthGuard)
  async uploadMedia(
    @Args('input') input: UploadMediaInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media> {
    return this.mediaService.uploadMedia(user.userId, input);
  }

  @Mutation(() => [Media])
  @UseGuards(GqlAuthGuard)
  async batchUploadMedia(
    @Args('inputs', { type: () => [UploadMediaInput] }) inputs: UploadMediaInput[],
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media[]> {
    return this.mediaService.batchUploadMedia(user.userId, inputs);
  }

  @Mutation(() => Media)
  @UseGuards(GqlAuthGuard)
  async updateMedia(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateMediaInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media> {
    return this.mediaService.updateMedia(id, user.userId, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteMedia(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.mediaService.deleteMedia(id, user.userId);
  }

  @Mutation(() => Media)
  @UseGuards(GqlAuthGuard)
  async toggleHighlight(
    @Args('mediaId', { type: () => ID }) mediaId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media> {
    return this.mediaService.toggleHighlight(mediaId, user.userId);
  }

  // ============== MUTATIONS - TAGS ==============

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async tagUsersInMedia(
    @Args('mediaId', { type: () => ID }) mediaId: string,
    @Args('userIds', { type: () => [ID] }) userIds: string[],
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.mediaService.tagUsersInMedia(mediaId, user.userId, userIds);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async selfTagMedia(
    @Args('mediaId', { type: () => ID }) mediaId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.mediaService.selfTagMedia(mediaId, user.userId);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async removeMediaTag(
    @Args('mediaId', { type: () => ID }) mediaId: string,
    @Args('userId', { type: () => ID }) tagUserId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.mediaService.removeMediaTag(mediaId, user.userId, tagUserId);
  }
}

