import { ObjectType, Field, ID } from '@nestjs/graphql';
import { User } from '../../users/schemas/user.schema';
import { MemberRole } from '../schemas/team-member.schema';

@ObjectType()
export class TeamMemberWithUser {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  teamId: string;

  @Field(() => ID)
  userId: string;

  @Field(() => MemberRole)
  role: MemberRole;

  @Field(() => Date)
  joinedAt: Date;

  @Field(() => User, { nullable: true })
  user?: User;
}

