import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { LocalizedString, TeamInfo } from './team.dto';
import { VenueInfo } from './venue.dto';
import { MatchBroadcasts } from './broadcast.dto';

export enum MatchStage {
  GROUP = 'group',
  ROUND32 = 'round32',
  ROUND16 = 'round16',
  QUARTERFINAL = 'quarterfinal',
  SEMIFINAL = 'semifinal',
  THIRD = 'third',
  FINAL = 'final',
}

registerEnumType(MatchStage, {
  name: 'MatchStage',
  description: 'Stage of the match in the tournament',
});

@ObjectType()
export class MatchDto {
  @Field()
  id: string;

  @Field()
  matchNumber: number;

  @Field(() => MatchStage)
  stage: MatchStage;

  @Field({ nullable: true })
  groupId?: string;

  @Field()
  homeTeamId: string;

  @Field()
  awayTeamId: string;

  @Field()
  dateTimeUTC: string;

  @Field()
  venueId: string;

  @Field(() => MatchBroadcasts)
  broadcasts: MatchBroadcasts;

  @Field(() => LocalizedString)
  slug: LocalizedString;
}

@ObjectType()
export class MatchWithTeams {
  @Field()
  id: string;

  @Field()
  matchNumber: number;

  @Field()
  stage: string;

  @Field()
  stageName: string;

  @Field({ nullable: true })
  groupId?: string;

  @Field(() => TeamInfo)
  homeTeam: TeamInfo;

  @Field(() => TeamInfo)
  awayTeam: TeamInfo;

  @Field()
  dateTimeUTC: string;

  @Field(() => VenueInfo)
  venue: VenueInfo;

  @Field(() => MatchBroadcasts)
  broadcasts: MatchBroadcasts;
}
