// DTOs for Feed Contextual Cards

import { Field, ObjectType, ID, registerEnumType, Int } from '@nestjs/graphql';

// Card types enum
export enum FeedCardType {
  PREDICTION = 'PREDICTION',   // Invite to predict upcoming match
  RESULT = 'RESULT',           // Show prediction result
  REMINDER = 'REMINDER',       // Match starting soon
  WEEKLY = 'WEEKLY',           // Weekly summary stats
  STREAK = 'STREAK',           // Prediction streak
}

registerEnumType(FeedCardType, {
  name: 'FeedCardType',
  description: 'Type of contextual card in the feed',
});

// Prediction result enum
export enum PredictionOutcome {
  HOME = 'HOME',
  DRAW = 'DRAW',
  AWAY = 'AWAY',
}

registerEnumType(PredictionOutcome, {
  name: 'PredictionOutcome',
  description: 'Prediction outcome (home win, draw, away win)',
});

// Team info for cards
@ObjectType()
export class FeedCardTeam {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  code: string;

  @Field()
  flag: string;
}

// Match info for cards
@ObjectType()
export class FeedCardMatch {
  @Field(() => ID)
  id: string;

  @Field(() => FeedCardTeam)
  homeTeam: FeedCardTeam;

  @Field(() => FeedCardTeam)
  awayTeam: FeedCardTeam;

  @Field()
  dateTimeUTC: string;

  @Field({ nullable: true })
  stage?: string;

  @Field({ nullable: true })
  group?: string;
}

// Weekly stats
@ObjectType()
export class FeedCardWeeklyStats {
  @Field(() => Int)
  correct: number;

  @Field(() => Int)
  total: number;

  @Field(() => Int, { nullable: true })
  rank?: number;

  @Field(() => Int, { nullable: true })
  rankChange?: number;

  @Field(() => Int)
  percentage: number;
}

// Main contextual card type
@ObjectType()
export class FeedContextualCard {
  @Field(() => ID)
  id: string;

  @Field(() => FeedCardType)
  type: FeedCardType;

  @Field(() => Int)
  priority: number;

  @Field(() => Int)
  position: number;

  // For PREDICTION, RESULT, REMINDER cards
  @Field(() => FeedCardMatch, { nullable: true })
  match?: FeedCardMatch;

  // For RESULT cards
  @Field(() => PredictionOutcome, { nullable: true })
  userPrediction?: PredictionOutcome;

  @Field(() => PredictionOutcome, { nullable: true })
  actualResult?: PredictionOutcome;

  @Field(() => Int, { nullable: true })
  pointsEarned?: number;

  @Field({ nullable: true })
  isCorrect?: boolean;

  // For REMINDER cards
  @Field(() => Int, { nullable: true })
  minutesUntil?: number;

  // For WEEKLY cards
  @Field(() => FeedCardWeeklyStats, { nullable: true })
  weeklyStats?: FeedCardWeeklyStats;

  // For STREAK cards
  @Field(() => Int, { nullable: true })
  streakCount?: number;
}

// Response type
@ObjectType()
export class FeedContextualCardsResponse {
  @Field(() => [FeedContextualCard])
  cards: FeedContextualCard[];

  @Field(() => Int)
  totalCards: number;
}
