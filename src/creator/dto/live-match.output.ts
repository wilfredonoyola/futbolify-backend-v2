import { ObjectType, Field, ID, Int, Float, registerEnumType } from '@nestjs/graphql';

export enum MatchEventType {
  GOAL = 'Goal',
  CARD = 'Card',
  SUBST = 'subst',
  VAR = 'Var',
}

registerEnumType(MatchEventType, { name: 'MatchEventType' });

@ObjectType()
export class MatchTeam {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field({ nullable: true })
  logo?: string;

  @Field(() => Int, { nullable: true })
  goals?: number;

  @Field({ nullable: true })
  winner?: boolean;
}

@ObjectType()
export class MatchEvent {
  @Field(() => Int)
  minute: number;

  @Field(() => Int, { nullable: true })
  extraMinute?: number;

  @Field()
  type: string;

  @Field({ nullable: true })
  detail?: string;

  @Field({ nullable: true })
  playerName?: string;

  @Field({ nullable: true })
  playerPhoto?: string;

  @Field({ nullable: true })
  assistName?: string;

  @Field()
  teamName: string;

  @Field({ nullable: true })
  teamLogo?: string;

  @Field({ nullable: true })
  comments?: string;
}

@ObjectType()
export class MatchStatistic {
  @Field()
  type: string;

  @Field({ nullable: true })
  home?: string;

  @Field({ nullable: true })
  away?: string;
}

@ObjectType()
export class MatchLineupPlayer {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field(() => Int)
  number: number;

  @Field({ nullable: true })
  pos?: string;

  @Field({ nullable: true })
  grid?: string;

  @Field({ nullable: true })
  photo?: string;
}

@ObjectType()
export class MatchLineup {
  @Field()
  teamName: string;

  @Field({ nullable: true })
  teamLogo?: string;

  @Field({ nullable: true })
  formation?: string;

  @Field(() => [MatchLineupPlayer])
  startXI: MatchLineupPlayer[];

  @Field(() => [MatchLineupPlayer])
  substitutes: MatchLineupPlayer[];

  @Field({ nullable: true })
  coach?: string;
}

@ObjectType()
export class LiveMatchData {
  @Field(() => Int)
  fixtureId: number;

  @Field()
  date: Date;

  @Field()
  status: string;

  @Field()
  statusLong: string;

  @Field(() => Int, { nullable: true })
  elapsed?: number;

  @Field({ nullable: true })
  venue?: string;

  @Field({ nullable: true })
  referee?: string;

  @Field()
  league: string;

  @Field({ nullable: true })
  leagueLogo?: string;

  @Field({ nullable: true })
  round?: string;

  @Field(() => MatchTeam)
  homeTeam: MatchTeam;

  @Field(() => MatchTeam)
  awayTeam: MatchTeam;

  @Field(() => [MatchEvent])
  events: MatchEvent[];

  @Field(() => [MatchStatistic])
  statistics: MatchStatistic[];

  @Field(() => [MatchLineup])
  lineups: MatchLineup[];

  // Score details
  @Field(() => Int, { nullable: true })
  halftimeHome?: number;

  @Field(() => Int, { nullable: true })
  halftimeAway?: number;

  @Field(() => Int, { nullable: true })
  fulltimeHome?: number;

  @Field(() => Int, { nullable: true })
  fulltimeAway?: number;
}

@ObjectType()
export class LiveMatchResponse {
  @Field()
  success: boolean;

  @Field(() => LiveMatchData, { nullable: true })
  match?: LiveMatchData;

  @Field({ nullable: true })
  error?: string;

  @Field()
  cachedAt: Date;

  @Field(() => Int)
  cacheExpiresIn: number; // seconds until cache expires
}
