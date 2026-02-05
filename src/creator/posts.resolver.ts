import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards, BadRequestException } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PostsService } from './posts.service';
import { GenerationService } from './generation.service';
import { ContentService } from './content.service';
import { Post } from './schemas/post.schema';
import {
  GeneratePostInput,
  UpdatePostContentInput,
  SubmitFeedbackInput,
  RejectPostInput,
  PostFilterInput,
  SavePostTemplateInput,
} from './dto/post.dto';

@Resolver(() => Post)
@UseGuards(GqlAuthGuard)
export class PostsResolver {
  constructor(
    private readonly postsService: PostsService,
    private readonly generationService: GenerationService,
    private readonly contentService: ContentService,
  ) {}

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get a single post by ID
   */
  @Query(() => Post, { name: 'post' })
  async getPost(@Args('id', { type: () => ID }) id: string): Promise<Post> {
    return this.postsService.findById(id);
  }

  /**
   * Get pending posts for a brand
   */
  @Query(() => [Post], { name: 'pendingPosts' })
  async getPendingPosts(
    @Args('brandId', { type: () => ID }) brandId: string,
  ): Promise<Post[]> {
    return this.postsService.findPendingByBrand(brandId);
  }

  /**
   * Get posts for a brand with optional filters
   */
  @Query(() => [Post], { name: 'brandPosts' })
  async getBrandPosts(
    @Args('brandId', { type: () => ID }) brandId: string,
    @Args('filter', { nullable: true }) filter?: PostFilterInput,
  ): Promise<Post[]> {
    return this.postsService.findByBrand(brandId, filter);
  }

  /**
   * Get posts claimed by the current user (in progress)
   */
  @Query(() => [Post], { name: 'myClaimedPosts' })
  async getMyClaimedPosts(@CurrentUser() user: any): Promise<Post[]> {
    return this.postsService.findClaimedByUser(user.userId);
  }

  /**
   * Get downloaded posts by the current user
   */
  @Query(() => [Post], { name: 'myDownloadedPosts' })
  async getMyDownloadedPosts(@CurrentUser() user: any): Promise<Post[]> {
    return this.postsService.findDownloadedByUser(user.userId);
  }

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /**
   * Generate a new post from a content suggestion
   */
  @Mutation(() => Post)
  async generatePost(
    @CurrentUser() user: any,
    @Args('input') input: GeneratePostInput,
  ): Promise<Post> {
    // Check if a post already exists for this suggestion
    const exists = await this.postsService.existsForSuggestion(
      input.suggestionId,
      input.brandId,
    );
    if (exists) {
      throw new BadRequestException(
        'A post has already been generated for this suggestion',
      );
    }

    // Try to get suggestion from cache
    let suggestion = this.generationService.getSuggestion(input.suggestionId);

    // If not in cache, we need to refetch content
    // This is a fallback - ideally suggestions should be cached when fetched
    if (!suggestion) {
      throw new BadRequestException(
        'Suggestion not found in cache. Please refresh content suggestions and try again.',
      );
    }

    return this.postsService.generateAndCreate(input.suggestionId, input.brandId);
  }

  /**
   * Claim a post for editing
   */
  @Mutation(() => Post)
  async claimPost(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Post> {
    return this.postsService.claim(id, user.userId);
  }

  /**
   * Release a claimed post back to pending
   */
  @Mutation(() => Post)
  async releasePost(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Post> {
    return this.postsService.release(id, user.userId);
  }

  /**
   * Update the final text of a claimed post
   */
  @Mutation(() => Post)
  async updatePostContent(
    @CurrentUser() user: any,
    @Args('input') input: UpdatePostContentInput,
  ): Promise<Post> {
    return this.postsService.updateContent(
      input.postId,
      user.userId,
      input.finalText,
    );
  }

  /**
   * Mark a post as ready for publishing
   */
  @Mutation(() => Post)
  async markPostReady(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Post> {
    return this.postsService.markReady(id, user.userId);
  }

  /**
   * Mark a post as downloaded
   */
  @Mutation(() => Post)
  async markPostDownloaded(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Post> {
    return this.postsService.markDownloaded(id, user.userId);
  }

  /**
   * Mark a post as published
   */
  @Mutation(() => Post)
  async markPostPublished(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Post> {
    return this.postsService.markPublished(id, user.userId);
  }

  /**
   * Reject a post
   */
  @Mutation(() => Post)
  async rejectPost(
    @CurrentUser() user: any,
    @Args('input') input: RejectPostInput,
  ): Promise<Post> {
    return this.postsService.reject(input.postId, user.userId, input.reason);
  }

  /**
   * Submit feedback for a published post
   */
  @Mutation(() => Post)
  async submitPostFeedback(
    @Args('input') input: SubmitFeedbackInput,
  ): Promise<Post> {
    return this.postsService.submitFeedback(
      input.postId,
      input.rating,
      input.notes,
    );
  }

  /**
   * Save template data for a post (editor state persistence)
   */
  @Mutation(() => Post)
  async savePostTemplate(
    @CurrentUser() user: any,
    @Args('input') input: SavePostTemplateInput,
  ): Promise<Post> {
    return this.postsService.saveTemplate(
      input.postId,
      user.userId,
      input.templateData,
    );
  }
}
