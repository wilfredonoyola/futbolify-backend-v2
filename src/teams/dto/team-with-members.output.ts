import { ObjectType, Field } from '@nestjs/graphql';
import { Team } from '../schemas/team.schema';
import { TeamMemberWithUser } from './team-member-with-user.output';

@ObjectType()
export class TeamWithMembers extends Team {
  @Field(() => [TeamMemberWithUser])
  members: TeamMemberWithUser[];
}

