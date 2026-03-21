import { Field, ObjectType, Int, createUnionType, registerEnumType } from '@nestjs/graphql';
import { UserPostOutput } from './user-post.dto';
import { FeedContextualCard } from './feed-contextual-card.dto';

// Enum for feed item types (used by clients to determine rendering)
export enum FeedItemType {
  USER_POST = 'USER_POST',
  CONTEXTUAL_CARD = 'CONTEXTUAL_CARD',
  SUGGESTION = 'SUGGESTION',
  AD = 'AD',
}

registerEnumType(FeedItemType, {
  name: 'FeedItemType',
  description: 'Type of item in the feed',
});

// Wrapper for user posts in feed
@ObjectType()
export class FeedUserPostItem {
  @Field(() => FeedItemType)
  itemType: FeedItemType.USER_POST;

  @Field(() => Int)
  position: number;

  @Field(() => UserPostOutput)
  post: UserPostOutput;
}

// Wrapper for contextual cards in feed
@ObjectType()
export class FeedContextualCardItem {
  @Field(() => FeedItemType)
  itemType: FeedItemType.CONTEXTUAL_CARD;

  @Field(() => Int)
  position: number;

  @Field(() => FeedContextualCard)
  card: FeedContextualCard;
}

// Wrapper for suggestions (follow users, join quinielas)
@ObjectType()
export class FeedSuggestionItem {
  @Field(() => FeedItemType)
  itemType: FeedItemType.SUGGESTION;

  @Field(() => Int)
  position: number;

  @Field()
  suggestionType: string; // 'follow_users', 'join_quiniela', etc.

  @Field(() => [SuggestionUser], { nullable: true })
  users?: SuggestionUser[];

  @Field(() => [SuggestionQuiniela], { nullable: true })
  quinielas?: SuggestionQuiniela[];
}

@ObjectType()
export class SuggestionUser {
  @Field()
  userId: string;

  @Field()
  username: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field()
  isVerified: boolean;

  @Field(() => Int)
  followersCount: number;
}

@ObjectType()
export class SuggestionQuiniela {
  @Field()
  quinielaId: string;

  @Field()
  name: string;

  @Field()
  code: string;

  @Field({ nullable: true })
  imageUrl?: string;

  @Field(() => Int)
  memberCount: number;

  @Field()
  leagueId: string;
}

// Union type for feed items - allows returning different types
export const FeedItem = createUnionType({
  name: 'FeedItem',
  types: () => [FeedUserPostItem, FeedContextualCardItem, FeedSuggestionItem] as const,
  resolveType(value) {
    if (value.itemType === FeedItemType.USER_POST) {
      return FeedUserPostItem;
    }
    if (value.itemType === FeedItemType.CONTEXTUAL_CARD) {
      return FeedContextualCardItem;
    }
    if (value.itemType === FeedItemType.SUGGESTION) {
      return FeedSuggestionItem;
    }
    return null;
  },
});

// Main feed response
@ObjectType()
export class MyFeedResponse {
  @Field(() => [FeedItem])
  items: Array<typeof FeedItem>;

  @Field(() => Int)
  totalItems: number;

  @Field()
  hasMore: boolean;

  @Field(() => Int)
  nextOffset: number;
}

// User posts list response (for profile, etc.)
@ObjectType()
export class UserPostsResponse {
  @Field(() => [UserPostOutput])
  posts: UserPostOutput[];

  @Field(() => Int)
  total: number;

  @Field()
  hasMore: boolean;
}
