import { Resolver, Query, Args, Context, Int } from '@nestjs/graphql';
import { FeedService } from './feed.service';
import {
  FeedContextualCard,
  FeedContextualCardsResponse,
} from './dto/feed-contextual-card.dto';

@Resolver()
export class FeedResolver {
  constructor(private readonly feedService: FeedService) {}

  /**
   * Get contextual cards for the user's feed
   *
   * Returns personalized cards based on:
   * - Upcoming matches without predictions
   * - Recent match results (if user predicted)
   * - Weekly summary stats
   * - Prediction streaks
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
        limit: Math.min(limit, 3), // Limit for non-auth users
        cardInterval,
      });

      // Filter to only prediction cards for anonymous users
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
   * Useful for refreshing a specific card
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
}
