import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql';

export enum ContentType {
  BREAKING = 'breaking',
  MATCHDAY = 'matchday',
  RESULT = 'result',
  TRANSFER = 'transfer',
  INJURY = 'injury',
  STATS = 'stats',
  QUOTE = 'quote',
  MEME = 'meme',
  THROWBACK = 'throwback',
  RUMOR = 'rumor',
  GENERAL = 'general',
}

export enum ContentPriority {
  URGENT = 'urgent',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export enum PageType {
  SINGLE_TEAM = 'single-team',
  LEAGUE = 'league',
  MULTI_TEAM = 'multi-team',
  WOMENS = 'womens',
  GENERAL = 'general',
}

registerEnumType(ContentType, { name: 'ContentType' });
registerEnumType(ContentPriority, { name: 'ContentPriority' });
registerEnumType(PageType, { name: 'PageType' });

export enum ContentStatus {
  AVAILABLE = 'available',
  CLAIMED = 'claimed',
  IN_PROGRESS = 'in-progress',
  DONE = 'done',
  DISMISSED = 'dismissed',
}

registerEnumType(ContentStatus, { name: 'ContentStatus' });

@ObjectType()
export class ClaimedBy {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  avatar?: string;
}

@ObjectType()
export class ContentSuggestion {
  @Field(() => ID)
  id: string;

  @Field(() => ContentType)
  type: ContentType;

  @Field(() => ContentPriority)
  priority: ContentPriority;

  @Field()
  title: string;

  @Field({ nullable: true })
  originalTitle?: string;

  @Field({ nullable: true })
  rewrittenTitle?: string;

  @Field()
  description: string;

  @Field({ nullable: true })
  originalDescription?: string;

  @Field({ nullable: true })
  source?: string;

  @Field({ nullable: true })
  sourceLanguage?: string;

  @Field({ nullable: true })
  sourceUrl?: string;

  @Field({ nullable: true })
  imageUrl?: string;

  @Field()
  timestamp: Date;

  @Field(() => [String])
  suggestedTemplates: string[];

  @Field({ nullable: true })
  suggestedCaption?: string;

  @Field(() => [String], { nullable: true })
  hashtags?: string[];

  @Field(() => Int, { nullable: true })
  viralScore?: number;

  @Field(() => Int, { nullable: true })
  relevanceScore?: number;

  @Field({ nullable: true })
  isRelevant?: boolean;

  @Field({ nullable: true })
  wasProcessedByAI?: boolean;

  // Claim/collaboration fields
  @Field(() => ContentStatus, { defaultValue: ContentStatus.AVAILABLE })
  status: ContentStatus;

  @Field(() => ClaimedBy, { nullable: true })
  claimedBy?: ClaimedBy;

  @Field({ nullable: true })
  claimedAt?: Date;

  @Field(() => [String], { defaultValue: [] })
  seenBy: string[];
}

@ObjectType()
export class NextMatchInfo {
  @Field()
  opponent: string;

  @Field()
  date: Date;

  @Field()
  time: string;

  @Field()
  competition: string;

  @Field()
  isHome: boolean;

  @Field(() => Int)
  hoursUntil: number;
}

@ObjectType()
export class LastMatchInfo {
  @Field()
  opponent: string;

  @Field()
  date: Date;

  @Field()
  result: string;

  @Field()
  competition: string;

  @Field()
  wasHome: boolean;

  @Field(() => Int)
  daysAgo: number;
}

@ObjectType()
export class LiveMatchInfo {
  @Field(() => Int)
  fixtureId: number;

  @Field()
  opponent: string;

  @Field()
  date: Date;

  @Field()
  time: string;

  @Field()
  competition: string;

  @Field()
  isHome: boolean;

  @Field()
  score: string;

  @Field(() => Int)
  minute: number;

  @Field()
  status: string;
}

@ObjectType()
export class MatchContextOutput {
  @Field()
  hasMatchToday: boolean;

  @Field()
  hasMatchTomorrow: boolean;

  @Field()
  isLive: boolean;

  @Field(() => LiveMatchInfo, { nullable: true })
  liveMatch?: LiveMatchInfo;

  @Field(() => NextMatchInfo, { nullable: true })
  nextMatch?: NextMatchInfo;

  @Field(() => LastMatchInfo, { nullable: true })
  lastMatch?: LastMatchInfo;

  @Field()
  isMatchday: boolean;

  @Field({ nullable: true })
  matchdayPhase?: string;
}

@ObjectType()
export class ContentMeta {
  @Field(() => PageType)
  pageType: PageType;

  @Field({ nullable: true })
  teamId?: string;

  @Field(() => [String], { nullable: true })
  teamIds?: string[];

  @Field({ nullable: true })
  leagueId?: string;

  @Field(() => Int)
  totalItems: number;

  @Field(() => Int)
  urgentCount: number;

  @Field(() => Int)
  highPriorityCount: number;

  @Field()
  fetchedAt: Date;
}

@ObjectType()
export class ContentSuggestionsResponse {
  @Field()
  success: boolean;

  @Field(() => [ContentSuggestion])
  content: ContentSuggestion[];

  @Field(() => ContentMeta)
  meta: ContentMeta;

  @Field(() => MatchContextOutput, { nullable: true })
  matchContext?: MatchContextOutput;

  @Field({ nullable: true })
  error?: string;
}
