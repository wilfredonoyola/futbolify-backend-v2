import { ObjectType, Field, InputType, Int, registerEnumType } from '@nestjs/graphql';

export enum MatchEventType {
  GOAL = 'goal',
  CARD = 'card',
  SUBSTITUTION = 'substitution',
  VAR = 'var',
  HALFTIME = 'halftime',
  FULLTIME = 'fulltime',
  KICKOFF = 'kickoff',
}

registerEnumType(MatchEventType, { name: 'MatchEventType' });

@InputType()
export class PossessionInput {
  @Field(() => Int)
  home: number;

  @Field(() => Int)
  away: number;
}

@InputType()
export class ShotsInput {
  @Field(() => Int)
  home: number;

  @Field(() => Int)
  away: number;
}

@InputType()
export class GenerateViralContentInput {
  // Event info
  @Field(() => MatchEventType)
  eventType: MatchEventType;

  @Field(() => Int)
  minute: number;

  @Field({ nullable: true })
  playerName?: string;

  @Field({ nullable: true })
  assistName?: string;

  @Field({ nullable: true })
  detail?: string;

  // Match info
  @Field()
  homeTeam: string;

  @Field()
  awayTeam: string;

  @Field(() => Int)
  homeScore: number;

  @Field(() => Int)
  awayScore: number;

  @Field()
  competition: string;

  @Field({ nullable: true })
  round?: string;

  @Field({ nullable: true })
  venue?: string;

  // Context
  @Field()
  isHome: boolean;

  @Field()
  ourTeam: string;

  // Stats
  @Field(() => PossessionInput, { nullable: true })
  possession?: PossessionInput;

  @Field(() => ShotsInput, { nullable: true })
  shots?: ShotsInput;

  @Field(() => ShotsInput, { nullable: true })
  shotsOnTarget?: ShotsInput;
}

@ObjectType()
export class ViralContentOption {
  @Field()
  angle: string;

  @Field()
  emoji: string;

  @Field()
  content: string;

  @Field(() => [String])
  hashtags: string[];
}

@ObjectType()
export class ViralContentResponse {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  eventSummary?: string;

  @Field(() => [ViralContentOption], { nullable: true })
  options?: ViralContentOption[];

  @Field({ nullable: true })
  generatedAt?: Date;

  @Field({ nullable: true })
  error?: string;
}
