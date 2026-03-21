import { Resolver, Query, Mutation, Args, Context, Int, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FeedService } from './feed.service';
import {
  FeedContextualCard,
  FeedContextualCardsResponse,
} from './dto/feed-contextual-card.dto';
import {
  CreateUserPostInput,
  UpdateUserPostInput,
  FeedFilterInput,
  UserPostOutput,
  LikePostResult,
  DeletePostResult,
} from './dto/user-post.dto';
import {
  MyFeedResponse,
  UserPostsResponse,
  FeedItem,
} from './dto/unified-feed.dto';
import { UserPost } from './schemas/user-post.schema';

@Resolver()
export class FeedResolver {
  constructor(private readonly feedService: FeedService) {}

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get personalized feed for authenticated user
   * Returns posts + contextual cards interleaved
   */
  @Query(() => MyFeedResponse, { name: 'myFeed' })
  @UseGuards(GqlAuthGuard)
  async getMyFeed(
    @CurrentUser() user: any,
    @Args('filter', { nullable: true }) filter?: FeedFilterInput,
    @Args('locale', { nullable: true, defaultValue: 'es' }) locale?: 'es' | 'en',
  ): Promise<MyFeedResponse> {
    return this.feedService.getMyFeed(
      user.userId,
      filter || {},
      locale || 'es',
    );
  }

  /**
   * Get global feed (for non-authenticated or exploring)
   */
  @Query(() => MyFeedResponse, { name: 'globalFeed' })
  async getGlobalFeed(
    @Args('filter', { nullable: true }) filter?: FeedFilterInput,
    @Args('locale', { nullable: true, defaultValue: 'es' }) locale?: 'es' | 'en',
  ): Promise<MyFeedResponse> {
    return this.feedService.getGlobalFeed(filter || {}, locale || 'es');
  }

  /**
   * Get a single post by ID
   */
  @Query(() => UserPostOutput, { name: 'userPost', nullable: true })
  async getUserPost(
    @Args('postId', { type: () => ID }) postId: string,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<UserPostOutput | null> {
    const userId = context.req?.user?.userId;
    return this.feedService.getPostById(postId, userId);
  }

  /**
   * Get posts by a specific user
   */
  @Query(() => UserPostsResponse, { name: 'userPosts' })
  async getUserPosts(
    @Args('userId', { type: () => ID }) targetUserId: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 20 }) limit: number,
    @Args('offset', { type: () => Int, nullable: true, defaultValue: 0 }) offset: number,
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<UserPostsResponse> {
    const currentUserId = context.req?.user?.userId;
    return this.feedService.getUserPosts(targetUserId, currentUserId, limit, offset);
  }

  /**
   * Get contextual cards for the user's feed
   */
  @Query(() => FeedContextualCardsResponse, { name: 'feedContextualCards' })
  async getContextualCards(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 5 }) limit: number,
    @Args('cardInterval', { type: () => Int, nullable: true, defaultValue: 5 }) cardInterval: number,
    @Args('locale', { nullable: true, defaultValue: 'es' }) locale: 'es' | 'en',
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<FeedContextualCardsResponse> {
    const userId = context.req?.user?.userId;

    // For non-authenticated users, return prediction cards for upcoming matches only
    if (!userId) {
      const publicCards = await this.feedService.getContextualCards({
        userId: 'anonymous',
        locale,
        limit: Math.min(limit, 3),
        cardInterval,
      });

      const filteredCards = publicCards.filter(
        (card) => card.type === 'PREDICTION' || card.type === 'REMINDER',
      );

      return {
        cards: filteredCards,
        totalCards: filteredCards.length,
      };
    }

    const cards = await this.feedService.getContextualCards({
      userId,
      locale,
      limit,
      cardInterval,
    });

    return {
      cards,
      totalCards: cards.length,
    };
  }

  /**
   * Get a single contextual card by ID
   */
  @Query(() => FeedContextualCard, { name: 'feedContextualCard', nullable: true })
  async getContextualCard(
    @Args('cardId') cardId: string,
    @Args('locale', { nullable: true, defaultValue: 'es' }) locale: 'es' | 'en',
    @Context() context: { req?: { user?: { userId?: string } } },
  ): Promise<FeedContextualCard | null> {
    const userId = context.req?.user?.userId;
    if (!userId) return null;

    const cards = await this.feedService.getContextualCards({
      userId,
      locale,
      limit: 10,
      cardInterval: 5,
    });

    return cards.find((card) => card.id === cardId) || null;
  }

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /**
   * Create a new user post
   */
  @Mutation(() => UserPostOutput, { name: 'createUserPost' })
  @UseGuards(GqlAuthGuard)
  async createUserPost(
    @CurrentUser() user: any,
    @Args('input') input: CreateUserPostInput,
  ): Promise<UserPostOutput> {
    // Extract user info from the authenticated user
    const userInfo = {
      userId: user.userId,
      username: user.username || user.email?.split('@')[0] || 'user',
      displayName: user.displayName || user.name,
      avatarUrl: user.avatarUrl || user.picture,
      isVerified: user.isVerified || false,
    };

    return this.feedService.createUserPost(input, userInfo);
  }

  /**
   * Update an existing user post
   */
  @Mutation(() => UserPostOutput, { name: 'updateUserPost' })
  @UseGuards(GqlAuthGuard)
  async updateUserPost(
    @CurrentUser() user: any,
    @Args('input') input: UpdateUserPostInput,
  ): Promise<UserPostOutput> {
    return this.feedService.updateUserPost(input, user.userId);
  }

  /**
   * Delete a user post
   */
  @Mutation(() => DeletePostResult, { name: 'deleteUserPost' })
  @UseGuards(GqlAuthGuard)
  async deleteUserPost(
    @CurrentUser() user: any,
    @Args('postId', { type: () => ID }) postId: string,
  ): Promise<DeletePostResult> {
    return this.feedService.deleteUserPost(postId, user.userId);
  }

  /**
   * Like or unlike a post (toggle)
   */
  @Mutation(() => LikePostResult, { name: 'toggleLikePost' })
  @UseGuards(GqlAuthGuard)
  async toggleLikePost(
    @CurrentUser() user: any,
    @Args('postId', { type: () => ID }) postId: string,
  ): Promise<LikePostResult> {
    return this.feedService.toggleLikePost(postId, user.userId);
  }
}
