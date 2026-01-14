import { Resolver, Query, Mutation, Args, ID, ResolveField, Parent } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { MediaService } from './media.service';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUserPayload } from '../auth/current-user-payload.interface';
import { Media, MediaType, MediaCategory } from './schemas/media.schema';
import { MediaTag } from './schemas/media-tag.schema';
import { UploadMediaInput, UpdateMediaInput, MediaFiltersInput, ProfileStats } from './dto';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { FileUpload } from 'graphql-upload/Upload.mjs';

@Resolver(() => Media)
export class MediaResolver {
  constructor(private readonly mediaService: MediaService) {}

  // ============== FIELD RESOLVERS ==============

  @ResolveField(() => [MediaTag], { nullable: true })
  async tags(@Parent() media: Media): Promise<MediaTag[]> {
    return this.mediaService.getMediaTags(media._id.toString());
  }

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

  /**
   * Get ALL media related to current user:
   * - Media where user is tagged
   * - Media uploaded by user
   */
  @Query(() => [Media], { name: 'allMyMedia' })
  @UseGuards(GqlAuthGuard)
  async getAllMyMedia(
    @Args('type', { type: () => String, nullable: true }) type: MediaType,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media[]> {
    return this.mediaService.getAllMyMedia(user.userId, type);
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

  /**
   * Get profile stats including uploaded + tagged media
   */
  @Query(() => ProfileStats, { name: 'allMyProfileStats' })
  @UseGuards(GqlAuthGuard)
  async getAllMyProfileStats(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ProfileStats> {
    return this.mediaService.getAllMyProfileStats(user.userId);
  }

  // ============== MUTATIONS ==============

  @Mutation(() => Media)
  @UseGuards(GqlAuthGuard)
  async uploadPhoto(
    @Args('matchId', { type: () => ID }) matchId: string,
    @Args('file', { type: () => GraphQLUpload }) file: any,
    @Args('category', { type: () => String, nullable: true }) category: MediaCategory,
    @Args('isHighlight', { type: () => Boolean, nullable: true, defaultValue: false }) isHighlight: boolean,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media> {
    return this.mediaService.uploadPhoto(user.userId, matchId, file, category, isHighlight);
  }

  @Mutation(() => Media)
  @UseGuards(GqlAuthGuard)
  async uploadVideo(
    @Args('matchId', { type: () => ID }) matchId: string,
    @Args('file', { type: () => GraphQLUpload }) file: any,
    @Args('category', { type: () => String, nullable: true }) category: MediaCategory,
    @Args('isHighlight', { type: () => Boolean, nullable: true, defaultValue: false }) isHighlight: boolean,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Media> {
    return this.mediaService.uploadVideo(user.userId, matchId, file, category, isHighlight);
  }

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

