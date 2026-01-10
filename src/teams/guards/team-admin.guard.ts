import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TeamMember, TeamMemberDocument, MemberRole } from '../schemas/team-member.schema';

@Injectable()
export class TeamAdminGuard implements CanActivate {
  constructor(
    @InjectModel(TeamMember.name)
    private teamMemberModel: Model<TeamMemberDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context);
    const { userId } = ctx.getContext().req.user || {};
    const args = ctx.getArgs();

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get teamId from args (could be direct or nested in input)
    const teamId = args.teamId || args.id || args.input?.teamId;

    if (!teamId) {
      throw new ForbiddenException('Team ID not provided');
    }

    // Check if user is an admin of the team
    const member = await this.teamMemberModel.findOne({
      teamId,
      userId,
      role: MemberRole.ADMIN,
    });

    if (!member) {
      throw new ForbiddenException('You are not an admin of this team');
    }

    return true;
  }
}

