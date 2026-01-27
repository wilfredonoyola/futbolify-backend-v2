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

  @Field({ nullable: true })
  error?: string;
}
