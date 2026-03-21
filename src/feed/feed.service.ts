import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QueriesService, RawMatch } from '../worldcup/queries/queries.service';
import { Quiniela, QuinielaDocument } from '../quiniela/schemas/quiniela.schema';
import { UserPost, UserPostDocument, UserPostContentType } from './schemas/user-post.schema';
import {
  FeedContextualCard,
  FeedCardType,
  PredictionOutcome,
  FeedCardMatch,
  FeedCardLiveMatch,
  FeedCardLeaderboardChange,
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
  FeedItemType,
  FeedUserPostItem,
  FeedContextualCardItem,
  MyFeedResponse,
  UserPostsResponse,
} from './dto/unified-feed.dto';

interface ContextualCardsOptions {
  userId: string;
  locale: 'es' | 'en';
  limit?: number;
  cardInterval?: number;
}

interface UserInfo {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
}

@Injectable()
export class FeedService {
  constructor(
    private readonly queriesService: QueriesService,
    @InjectModel(Quiniela.name) private readonly quinielaModel: Model<QuinielaDocument>,
    @InjectModel(UserPost.name) private readonly userPostModel: Model<UserPostDocument>,
  ) {}

  // ============================================================================
  // USER POST OPERATIONS
  // ============================================================================

  /**
   * Create a new user post
   */
  async createUserPost(
    input: CreateUserPostInput,
    userInfo: UserInfo,
  ): Promise<UserPostOutput> {
    const post = new this.userPostModel({
      author: {
        userId: userInfo.userId,
        username: userInfo.username,
        displayName: userInfo.displayName,
        avatarUrl: userInfo.avatarUrl,
        isVerified: userInfo.isVerified || false,
      },
      contentType: input.contentType,
      description: input.description || '',
      imageUrls: input.imageUrls,
      videoUrl: input.videoUrl,
      thumbnailUrl: input.thumbnailUrl,
      sharedMatch: input.sharedMatch,
      sharedQuiniela: input.sharedQuiniela,
      sharedPrediction: input.sharedPrediction,
      sharedRank: input.sharedRank,
      overlayPosition: input.overlayPosition,
    });

    const saved = await post.save();
    return this.mapPostToOutput(saved, userInfo.userId);
  }

  /**
   * Update an existing user post
   */
  async updateUserPost(
    input: UpdateUserPostInput,
    userId: string,
  ): Promise<UserPostOutput> {
    const post = await this.userPostModel.findById(input.postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.author.userId !== userId) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    if (input.description !== undefined) {
      post.description = input.description;
    }

    const updated = await post.save();
    return this.mapPostToOutput(updated, userId);
  }

  /**
   * Delete a user post (soft delete)
   */
  async deleteUserPost(postId: string, userId: string): Promise<DeletePostResult> {
    const post = await this.userPostModel.findById(postId);

    if (!post) {
      return { success: false, message: 'Post not found' };
    }

    if (post.author.userId !== userId) {
      return { success: false, message: 'You can only delete your own posts' };
    }

    post.isDeleted = true;
    post.deletedAt = new Date();
    await post.save();

    return { success: true };
  }

  /**
   * Like or unlike a post
   */
  async toggleLikePost(postId: string, userId: string): Promise<LikePostResult> {
    const post = await this.userPostModel.findById(postId);

    if (!post) {
      return { success: false, isLiked: false, likesCount: 0 };
    }

    const isCurrentlyLiked = post.likedBy.includes(userId);

    if (isCurrentlyLiked) {
      // Unlike
      post.likedBy = post.likedBy.filter((id) => id !== userId);
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      // Like
      post.likedBy.push(userId);
      post.likesCount += 1;
    }

    await post.save();

    return {
      success: true,
      isLiked: !isCurrentlyLiked,
      likesCount: post.likesCount,
    };
  }

  /**
   * Get a single post by ID
   */
  async getPostById(postId: string, userId?: string): Promise<UserPostOutput | null> {
    const post = await this.userPostModel.findOne({
      _id: postId,
      isDeleted: false,
      isVisible: true,
    });

    if (!post) return null;

    return this.mapPostToOutput(post, userId);
  }

  /**
   * Get posts by a specific user
   */
  async getUserPosts(
    targetUserId: string,
    currentUserId?: string,
    limit = 20,
    offset = 0,
  ): Promise<UserPostsResponse> {
    const query = {
      'author.userId': targetUserId,
      isDeleted: false,
      isVisible: true,
    };

    const [posts, total] = await Promise.all([
      this.userPostModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.userPostModel.countDocuments(query),
    ]);

    return {
      posts: posts.map((p) => this.mapPostToOutput(p as any, currentUserId)),
      total,
      hasMore: offset + posts.length < total,
    };
  }

  // ============================================================================
  // UNIFIED FEED
  // ============================================================================

  /**
   * Get personalized feed for a user (posts + contextual cards)
   */
  async getMyFeed(
    userId: string,
    filter: FeedFilterInput,
    locale: 'es' | 'en' = 'es',
  ): Promise<MyFeedResponse> {
    const {
      limit = 20,
      offset = 0,
      includeContextualCards = true,
      cardInterval = 5,
      contentType,
    } = filter;

    // 1. Get user posts
    const postQuery: any = {
      isDeleted: false,
      isVisible: true,
    };

    if (contentType) {
      postQuery.contentType = contentType;
    }

    const posts = await this.userPostModel
      .find(postQuery)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit + 5) // Fetch extra to account for card insertion
      .lean()
      .exec();

    // 2. Get contextual cards if enabled
    let contextualCards: FeedContextualCard[] = [];
    if (includeContextualCards && offset === 0) {
      contextualCards = await this.getContextualCards({
        userId,
        locale,
        limit: Math.ceil(limit / cardInterval),
        cardInterval,
      });
    }

    // 3. Build unified feed with interleaved cards
    const items: Array<FeedUserPostItem | FeedContextualCardItem> = [];
    let postIndex = 0;
    let cardIndex = 0;
    let position = offset;

    while (postIndex < posts.length && items.length < limit) {
      // Insert contextual card at intervals
      if (
        includeContextualCards &&
        cardIndex < contextualCards.length &&
        position > 0 &&
        position % cardInterval === 0
      ) {
        items.push({
          itemType: FeedItemType.CONTEXTUAL_CARD,
          position,
          card: contextualCards[cardIndex],
        });
        cardIndex++;
        position++;
        continue;
      }

      // Insert post
      const post = posts[postIndex];
      items.push({
        itemType: FeedItemType.USER_POST,
        position,
        post: this.mapPostToOutput(post as any, userId),
      });
      postIndex++;
      position++;
    }

    // Add remaining cards at the end if any
    while (cardIndex < contextualCards.length && items.length < limit) {
      items.push({
        itemType: FeedItemType.CONTEXTUAL_CARD,
        position,
        card: contextualCards[cardIndex],
      });
      cardIndex++;
      position++;
    }

    const totalPosts = await this.userPostModel.countDocuments(postQuery);

    return {
      items,
      totalItems: totalPosts + contextualCards.length,
      hasMore: postIndex < posts.length || offset + limit < totalPosts,
      nextOffset: offset + items.length,
    };
  }

  /**
   * Get global feed (all public posts, for non-authenticated users)
   */
  async getGlobalFeed(
    filter: FeedFilterInput,
    locale: 'es' | 'en' = 'es',
  ): Promise<MyFeedResponse> {
    const { limit = 20, offset = 0, contentType } = filter;

    const postQuery: any = {
      isDeleted: false,
      isVisible: true,
    };

    if (contentType) {
      postQuery.contentType = contentType;
    }

    const [posts, total] = await Promise.all([
      this.userPostModel
        .find(postQuery)
        .sort({ createdAt: -1, likesCount: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.userPostModel.countDocuments(postQuery),
    ]);

    const items: FeedUserPostItem[] = posts.map((post, index) => ({
      itemType: FeedItemType.USER_POST,
      position: offset + index,
      post: this.mapPostToOutput(post as any),
    }));

    return {
      items,
      totalItems: total,
      hasMore: offset + posts.length < total,
      nextOffset: offset + posts.length,
    };
  }

  // ============================================================================
  // CONTEXTUAL CARDS
  // ============================================================================

  /**
   * Get contextual cards for a user's feed
   */
  async getContextualCards(options: ContextualCardsOptions): Promise<FeedContextualCard[]> {
    const { userId, locale, limit = 5, cardInterval = 5 } = options;
    const cards: FeedContextualCard[] = [];
    let position = 0;

    // 1. Get upcoming matches
    const upcomingMatches = this.queriesService.getUpcomingMatches(5);

    // 2. Get user's quinielas and predictions
    const userQuinielas = await this.quinielaModel
      .find({ 'members.userId': userId })
      .lean()
      .exec();

    // Collect all user predictions across all quinielas
    const userPredictions = new Map<string, { prediction: string; quinielaId: string }>();
    for (const quiniela of userQuinielas) {
      const member = quiniela.members.find((m) => m.userId.toString() === userId);
      if (member) {
        for (const pred of member.predictions || []) {
          if (!userPredictions.has(pred.matchId)) {
            userPredictions.set(pred.matchId, {
              prediction: pred.simplePrediction || this.scoreToOutcome(pred.homeScore, pred.awayScore),
              quinielaId: quiniela._id.toString(),
            });
          }
        }
      }
    }

    // 3. Get user stats (aggregate across all quinielas)
    const userStats = this.calculateUserStats(userQuinielas, userId);

    // 4. Check for LIVE matches
    const liveMatches = this.getLiveMatches(locale);
    for (const liveMatch of liveMatches) {
      if (cards.length >= limit) break;

      cards.push({
        id: `live-${liveMatch.id}`,
        type: FeedCardType.LIVE_MATCH,
        priority: 150, // Highest priority
        position: position,
        liveMatch: liveMatch,
      });
      position += cardInterval;
    }

    // 5. Generate PREDICTION cards for upcoming matches without predictions
    for (const match of upcomingMatches) {
      if (cards.length >= limit) break;

      const hasPrediction = userPredictions.has(match.id);
      const matchTime = new Date(match.dateTimeUTC);
      const now = new Date();
      const minutesUntil = Math.floor((matchTime.getTime() - now.getTime()) / (1000 * 60));

      if (!hasPrediction && minutesUntil > 0) {
        const matchWithTeams = this.buildFeedCardMatch(match, locale);
        if (!matchWithTeams) continue;

        // Check if it's a reminder (match starting soon - within 2 hours)
        if (minutesUntil <= 120) {
          cards.push({
            id: `reminder-${match.id}`,
            type: FeedCardType.REMINDER,
            priority: 100 - cards.length,
            position: position,
            match: matchWithTeams,
            minutesUntil,
          });
        } else {
          cards.push({
            id: `prediction-${match.id}`,
            type: FeedCardType.PREDICTION,
            priority: 50 - cards.length,
            position: position,
            match: matchWithTeams,
          });
        }
        position += cardInterval;
      }
    }

    // 6. Generate LEADERBOARD_CHANGE cards
    const leaderboardChanges = await this.getLeaderboardChanges(userId, userQuinielas);
    for (const change of leaderboardChanges) {
      if (cards.length >= limit) break;

      cards.push({
        id: `leaderboard-${change.quinielaId}`,
        type: FeedCardType.LEADERBOARD_CHANGE,
        priority: 70,
        position: position,
        leaderboardChange: change,
      });
      position += cardInterval;
    }

    // 7. Generate WEEKLY summary card
    if (userStats.total >= 3 && cards.length < limit) {
      cards.push({
        id: 'weekly-summary',
        type: FeedCardType.WEEKLY,
        priority: 40,
        position: position,
        weeklyStats: {
          correct: userStats.correct,
          total: userStats.total,
          rank: userStats.rank,
          rankChange: userStats.rankChange,
          percentage: userStats.total > 0
            ? Math.round((userStats.correct / userStats.total) * 100)
            : 0,
        },
      });
      position += cardInterval;
    }

    // 8. Generate STREAK card
    if (userStats.streak >= 3 && cards.length < limit) {
      const nextMatch = upcomingMatches[0];
      const nextMatchWithTeams = nextMatch ? this.buildFeedCardMatch(nextMatch, locale) : undefined;

      cards.push({
        id: `streak-${userStats.streak}`,
        type: FeedCardType.STREAK,
        priority: 60,
        position: position,
        streakCount: userStats.streak,
        match: nextMatchWithTeams,
      });
    }

    // Sort by priority and recalculate positions
    cards.sort((a, b) => b.priority - a.priority);
    cards.forEach((card, idx) => {
      card.position = idx * cardInterval;
    });

    return cards.slice(0, limit);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Map UserPost document to output DTO
   */
  private mapPostToOutput(post: UserPostDocument | any, currentUserId?: string): UserPostOutput {
    const isLikedByMe = currentUserId
      ? (post.likedBy || []).includes(currentUserId)
      : false;

    return {
      id: post._id?.toString() || post.id,
      author: post.author,
      contentType: post.contentType,
      description: post.description || '',
      imageUrls: post.imageUrls,
      videoUrl: post.videoUrl,
      thumbnailUrl: post.thumbnailUrl,
      sharedMatch: post.sharedMatch,
      sharedQuiniela: post.sharedQuiniela,
      sharedPrediction: post.sharedPrediction,
      sharedRank: post.sharedRank,
      overlayPosition: post.overlayPosition,
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      sharesCount: post.sharesCount || 0,
      isLikedByMe,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  /**
   * Get live matches (mock implementation - should integrate with live API)
   */
  private getLiveMatches(locale: 'es' | 'en'): FeedCardLiveMatch[] {
    // TODO: Integrate with real live match service
    // For now, check if any matches are currently in progress based on time
    const now = new Date();
    const matches = this.queriesService.getAllMatches();
    const liveMatches: FeedCardLiveMatch[] = [];

    for (const match of matches) {
      const matchTime = new Date(match.dateTimeUTC);
      const timeSinceStart = (now.getTime() - matchTime.getTime()) / (1000 * 60);

      // Match is "live" if it started within the last 120 minutes
      if (timeSinceStart >= 0 && timeSinceStart <= 120) {
        const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
        const awayTeam = this.queriesService.getTeamById(match.awayTeamId);

        if (homeTeam && awayTeam) {
          liveMatches.push({
            id: match.id,
            homeTeam: {
              id: homeTeam.id,
              name: homeTeam.name[locale],
              code: homeTeam.code,
              flag: homeTeam.flag,
            },
            awayTeam: {
              id: awayTeam.id,
              name: awayTeam.name[locale],
              code: awayTeam.code,
              flag: awayTeam.flag,
            },
            dateTimeUTC: match.dateTimeUTC,
            stage: match.stage,
            group: match.groupId,
            scoreHome: 0, // Would come from live API
            scoreAway: 0,
            minute: Math.min(Math.floor(timeSinceStart), 90),
            status: timeSinceStart <= 45 ? 'FIRST_HALF' :
                   timeSinceStart <= 60 ? 'HALF_TIME' : 'SECOND_HALF',
          });
        }
      }
    }

    return liveMatches.slice(0, 2); // Max 2 live matches
  }

  /**
   * Get leaderboard changes for user's quinielas
   */
  private async getLeaderboardChanges(
    userId: string,
    quinielas: any[],
  ): Promise<FeedCardLeaderboardChange[]> {
    const changes: FeedCardLeaderboardChange[] = [];

    for (const quiniela of quinielas) {
      const member = quiniela.members.find((m: any) => m.userId.toString() === userId);
      if (!member) continue;

      const currentRank = member.rank;
      const previousRank = member.previousRank || currentRank;

      // Only show if there's a rank change
      if (currentRank !== previousRank) {
        changes.push({
          quinielaId: quiniela._id.toString(),
          quinielaName: quiniela.name,
          previousRank,
          currentRank,
          totalMembers: quiniela.members.length,
          isImprovement: currentRank < previousRank,
        });
      }
    }

    // Sort by most significant improvements first
    return changes
      .sort((a, b) => {
        const aChange = a.previousRank - a.currentRank;
        const bChange = b.previousRank - b.currentRank;
        return bChange - aChange;
      })
      .slice(0, 3);
  }

  /**
   * Get recent (past) matches
   */
  private getRecentMatches(limit: number): RawMatch[] {
    const now = new Date();
    return this.queriesService
      .getAllMatches()
      .filter((m) => new Date(m.dateTimeUTC) < now)
      .sort((a, b) => new Date(b.dateTimeUTC).getTime() - new Date(a.dateTimeUTC).getTime())
      .slice(0, limit);
  }

  /**
   * Build FeedCardMatch from raw match data
   */
  private buildFeedCardMatch(match: RawMatch, locale: 'es' | 'en'): FeedCardMatch | null {
    const homeTeam = this.queriesService.getTeamById(match.homeTeamId);
    const awayTeam = this.queriesService.getTeamById(match.awayTeamId);

    if (!homeTeam || !awayTeam) return null;

    return {
      id: match.id,
      homeTeam: {
        id: homeTeam.id,
        name: homeTeam.name[locale],
        code: homeTeam.code,
        flag: homeTeam.flag,
      },
      awayTeam: {
        id: awayTeam.id,
        name: awayTeam.name[locale],
        code: awayTeam.code,
        flag: awayTeam.flag,
      },
      dateTimeUTC: match.dateTimeUTC,
      stage: match.stage,
      group: match.groupId,
    };
  }

  /**
   * Calculate user stats across all quinielas
   */
  private calculateUserStats(
    quinielas: any[],
    userId: string,
  ): { correct: number; total: number; rank?: number; rankChange?: number; streak: number } {
    let totalCorrect = 0;
    let totalPredictions = 0;
    let bestRank: number | undefined;
    let currentStreak = 0;

    for (const quiniela of quinielas) {
      const member = quiniela.members.find((m: any) => m.userId.toString() === userId);
      if (member) {
        totalCorrect += member.correctPredictions || 0;
        totalPredictions += (member.predictions || []).length;

        // Track best rank across quinielas
        if (member.rank && (!bestRank || member.rank < bestRank)) {
          bestRank = member.rank;
        }
      }
    }

    // Calculate streak (simplified)
    if (totalCorrect > 0 && totalPredictions > 0) {
      const recentAccuracy = totalCorrect / totalPredictions;
      if (recentAccuracy >= 0.8) currentStreak = 5;
      else if (recentAccuracy >= 0.6) currentStreak = 3;
      else if (recentAccuracy >= 0.4) currentStreak = 2;
    }

    return {
      correct: totalCorrect,
      total: totalPredictions,
      rank: bestRank,
      rankChange: bestRank ? Math.floor(Math.random() * 5) + 1 : undefined,
      streak: currentStreak,
    };
  }

  /**
   * Convert score prediction to outcome
   */
  private scoreToOutcome(homeScore?: number, awayScore?: number): string {
    if (homeScore === undefined || awayScore === undefined) return 'draw';
    if (homeScore > awayScore) return 'home';
    if (homeScore < awayScore) return 'away';
    return 'draw';
  }
}
