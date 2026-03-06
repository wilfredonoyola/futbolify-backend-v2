import { Field, ObjectType } from '@nestjs/graphql';
import { LocalizedString, TeamDto } from './team.dto';
import { MatchDto } from './match.dto';

@ObjectType()
export class GroupDto {
  @Field()
  id: string;

  @Field(() => LocalizedString)
  name: LocalizedString;

  @Field(() => [String])
  teamIds: string[];

  @Field(() => LocalizedString)
  slug: LocalizedString;
}

@ObjectType()
export class GroupWithTeams {
  @Field()
  id: string;

  @Field(() => LocalizedString)
  name: LocalizedString;

  @Field(() => [TeamDto])
  teams: TeamDto[];

  @Field(() => [MatchDto])
  matches: MatchDto[];

  @Field(() => LocalizedString)
  slug: LocalizedString;
}
