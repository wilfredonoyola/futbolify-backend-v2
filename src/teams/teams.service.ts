import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Team, TeamDocument } from './schemas/team.schema';
import { TeamMember, TeamMemberDocument, MemberRole } from './schemas/team-member.schema';
import { TeamMatch, TeamMatchDocument } from './schemas/team-match.schema';
import { Media, MediaDocument } from './schemas/media.schema';
import { StatsUtils } from './utils/stats.utils';
import { CreateTeamInput, UpdateTeamInput, CreateMatchInput, UpdateMatchInput } from './dto';

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(TeamMember.name) private teamMemberModel: Model<TeamMemberDocument>,
    @InjectModel(TeamMatch.name) private teamMatchModel: Model<TeamMatchDocument>,
    @InjectModel(Media.name) private mediaModel: Model<MediaDocument>,
  ) {}

  // ============== TEAMS ==============

  async createTeam(userId: string, input: CreateTeamInput): Promise<Team> {
    // Generate unique 6-character code
    let code: string;
    let exists = true;
    
    while (exists) {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const found = await this.teamModel.findOne({ code });
      exists = !!found;
    }

    // Create team with generated code
    const team = await this.teamModel.create({
      ...input,
      code,
      createdBy: new Types.ObjectId(userId),
    });

    // Add creator as admin
    await this.teamMemberModel.create({
      teamId: team._id,
      userId: new Types.ObjectId(userId),
      role: MemberRole.ADMIN,
    });

    return team;
  }

  async getMyTeams(userId: string): Promise<Team[]> {
    // Find all teams where user is a member
    const memberships = await this.teamMemberModel.find({ userId: new Types.ObjectId(userId) });
    const teamIds = memberships.map((m) => m.teamId);

    const teams = await this.teamModel.find({ _id: { $in: teamIds } }).exec();

    // Add stats to each team
    const teamsWithStats = await Promise.all(
      teams.map(async (team) => {
        const stats = await StatsUtils.getTeamStats(
          team._id.toString(),
          this.teamMatchModel,
          this.mediaModel,
          this.teamMemberModel,
        );
        return {
          ...team.toObject(),
          ...stats,
        };
      }),
    );

    return teamsWithStats as any;
  }

  async getTeam(teamId: string, userId: string): Promise<Team> {
    // Verify user is a member
    await this.verifyTeamMember(userId, teamId);

    const team = await this.teamModel.findById(teamId);
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    // Add stats
    const stats = await StatsUtils.getTeamStats(
      teamId,
      this.teamMatchModel,
      this.mediaModel,
      this.teamMemberModel,
    );

    return {
      ...team.toObject(),
      ...stats,
    } as any;
  }

  async getTeamByCode(code: string): Promise<Team> {
    const team = await this.teamModel.findOne({ code: code.toUpperCase() });
    if (!team) {
      throw new NotFoundException('Team not found with this code');
    }
    return team;
  }

  async updateTeam(teamId: string, userId: string, input: UpdateTeamInput): Promise<Team> {
    // Verify user is admin
    await this.verifyTeamAdmin(userId, teamId);

    const team = await this.teamModel.findByIdAndUpdate(teamId, input, { new: true });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return team;
  }

  async deleteTeam(teamId: string, userId: string): Promise<boolean> {
    // Verify user is admin
    await this.verifyTeamAdmin(userId, teamId);

    // Delete all related data
    await this.teamMemberModel.deleteMany({ teamId: new Types.ObjectId(teamId) });

    // Get all matches for this team
    const matches = await this.teamMatchModel.find({ teamId: new Types.ObjectId(teamId) });
    const matchIds = matches.map((m) => m._id);

    // Delete all media for these matches
    await this.mediaModel.deleteMany({ matchId: { $in: matchIds } });

    // Delete all matches
    await this.teamMatchModel.deleteMany({ teamId: new Types.ObjectId(teamId) });

    // Delete team
    await this.teamModel.findByIdAndDelete(teamId);

    return true;
  }

  // ============== MEMBERS ==============

  async joinTeam(userId: string, code: string): Promise<Team> {
    const team = await this.getTeamByCode(code);

    // Check if already a member
    const existingMember = await this.teamMemberModel.findOne({
      teamId: team._id,
      userId: new Types.ObjectId(userId),
    });

    if (existingMember) {
      throw new BadRequestException('You are already a member of this team');
    }

    // Add as member
    await this.teamMemberModel.create({
      teamId: team._id,
      userId: new Types.ObjectId(userId),
      role: MemberRole.MEMBER,
    });

    return team;
  }

  async leaveTeam(userId: string, teamId: string): Promise<boolean> {
    const userObjectId = new Types.ObjectId(userId);
    const teamObjectId = new Types.ObjectId(teamId);

    // Check if user is a member
    const member = await this.teamMemberModel.findOne({
      teamId: teamObjectId,
      userId: userObjectId,
    });

    if (!member) {
      throw new NotFoundException('You are not a member of this team');
    }

    // Check if user is the last admin
    if (member.role === MemberRole.ADMIN) {
      const adminCount = await this.teamMemberModel.countDocuments({
        teamId: teamObjectId,
        role: MemberRole.ADMIN,
      });

      if (adminCount === 1) {
        throw new BadRequestException('You are the last admin. Assign another admin before leaving.');
      }
    }

    // Remove membership
    await this.teamMemberModel.findByIdAndDelete(member._id);

    return true;
  }

  async getTeamMembers(teamId: string, userId: string): Promise<TeamMember[]> {
    // Verify user is a member
    await this.verifyTeamMember(userId, teamId);

    // Don't populate - return just the IDs as the GraphQL schema expects
    return this.teamMemberModel.find({ teamId: new Types.ObjectId(teamId) }).exec();
  }

  async getTeamMembersWithUser(teamId: string, userId: string): Promise<any[]> {
    // Verify user is a member
    await this.verifyTeamMember(userId, teamId);

    // Use aggregation with $lookup for reliable user population
    const members = await this.teamMemberModel.aggregate([
      { $match: { teamId: new Types.ObjectId(teamId) } },
      {
        $lookup: {
          from: 'users', // MongoDB collection name (lowercase, plural)
          localField: 'userId',
          foreignField: '_id',
          as: 'userArray',
        },
      },
      {
        $addFields: {
          user: { $arrayElemAt: ['$userArray', 0] },
        },
      },
      {
        $project: {
          userArray: 0, // Remove the temporary array
        },
      },
    ]);

    // Transform to match GraphQL schema
    return members.map((member) => {
      // Check if user exists and has required fields
      const hasValidUser = member.user && member.user._id && member.user.email;
      
      return {
        id: member._id.toString(),
        teamId: member.teamId.toString(),
        userId: member.userId.toString(),
        role: member.role,
        joinedAt: member.joinedAt,
        user: hasValidUser
          ? {
              userId: member.user._id.toString(),
              email: member.user.email,
              userName: member.user.userName || member.user.email,
              name: member.user.name || null,
              avatarUrl: member.user.avatarUrl || null,
            }
          : null,
      };
    });
  }

  async removeTeamMember(adminUserId: string, teamId: string, memberUserId: string): Promise<boolean> {
    // Verify admin
    await this.verifyTeamAdmin(adminUserId, teamId);

    const member = await this.teamMemberModel.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(memberUserId),
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Prevent removing the last admin
    if (member.role === MemberRole.ADMIN) {
      const adminCount = await this.teamMemberModel.countDocuments({
        teamId: new Types.ObjectId(teamId),
        role: MemberRole.ADMIN,
      });

      if (adminCount === 1) {
        throw new BadRequestException('Cannot remove the last admin');
      }
    }

    await this.teamMemberModel.findByIdAndDelete(member._id);
    return true;
  }

  async updateMemberRole(
    adminUserId: string,
    teamId: string,
    memberUserId: string,
    role: MemberRole,
  ): Promise<TeamMember> {
    // Verify admin
    await this.verifyTeamAdmin(adminUserId, teamId);

    const member = await this.teamMemberModel.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(memberUserId),
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // If demoting from admin, check if last admin
    if (member.role === MemberRole.ADMIN && role === MemberRole.MEMBER) {
      const adminCount = await this.teamMemberModel.countDocuments({
        teamId: new Types.ObjectId(teamId),
        role: MemberRole.ADMIN,
      });

      if (adminCount === 1) {
        throw new BadRequestException('Cannot demote the last admin');
      }
    }

    member.role = role;
    await member.save();

    return member;
  }

  // ============== MATCHES ==============

  async createMatch(userId: string, input: CreateMatchInput): Promise<TeamMatch> {
    // Verify user is a member
    await this.verifyTeamMember(userId, input.teamId);

    const match = await this.teamMatchModel.create({
      ...input,
      teamId: new Types.ObjectId(input.teamId),
      createdBy: new Types.ObjectId(userId),
    });

    return match;
  }

  async getOrCreateTodayMatch(userId: string, teamId: string): Promise<TeamMatch> {
    // Verify user is a member
    await this.verifyTeamMember(userId, teamId);

    // Get start and end of today (UTC)
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    // Try to find existing match for today
    let match = await this.teamMatchModel.findOne({
      teamId: new Types.ObjectId(teamId),
      date: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ date: -1 });

    if (match) {
      // Return existing match with stats
      const stats = await StatsUtils.getMatchStats(match._id.toString(), this.mediaModel);
      return {
        ...match.toObject(),
        ...stats,
      } as any;
    }

    // Create new match for today
    match = await this.teamMatchModel.create({
      teamId: new Types.ObjectId(teamId),
      date: today,
      createdBy: new Types.ObjectId(userId),
    });

    return match;
  }

  async getTeamMatches(teamId: string, userId: string): Promise<TeamMatch[]> {
    // Verify user is a member
    await this.verifyTeamMember(userId, teamId);

    const matches = await this.teamMatchModel
      .find({ teamId: new Types.ObjectId(teamId) })
      .sort({ date: -1 })
      .exec();

    // Add stats to each match
    const matchesWithStats = await Promise.all(
      matches.map(async (match) => {
        const stats = await StatsUtils.getMatchStats(match._id.toString(), this.mediaModel);
        return {
          ...match.toObject(),
          ...stats,
        };
      }),
    );

    return matchesWithStats as any;
  }

  async getMatch(matchId: string, userId: string): Promise<TeamMatch> {
    const match = await this.teamMatchModel.findById(matchId);

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    // Verify user is a member of the team
    await this.verifyTeamMember(userId, match.teamId.toString());

    // Add stats
    const stats = await StatsUtils.getMatchStats(matchId, this.mediaModel);

    return {
      ...match.toObject(),
      ...stats,
    } as any;
  }

  async updateMatch(matchId: string, userId: string, input: UpdateMatchInput): Promise<TeamMatch> {
    const match = await this.teamMatchModel.findById(matchId);

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    // Verify user is admin
    await this.verifyTeamAdmin(userId, match.teamId.toString());

    Object.assign(match, input);
    await match.save();

    return match;
  }

  async deleteMatch(matchId: string, userId: string): Promise<boolean> {
    const match = await this.teamMatchModel.findById(matchId);

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    // Verify user is admin
    await this.verifyTeamAdmin(userId, match.teamId.toString());

    // Delete all media for this match
    await this.mediaModel.deleteMany({ matchId: new Types.ObjectId(matchId) });

    // Delete match
    await this.teamMatchModel.findByIdAndDelete(matchId);

    return true;
  }

  // ============== HELPERS ==============

  async verifyTeamMember(userId: string, teamId: string): Promise<TeamMember> {
    const member = await this.teamMemberModel.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(userId),
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this team');
    }

    return member;
  }

  async verifyTeamAdmin(userId: string, teamId: string): Promise<TeamMember> {
    const member = await this.teamMemberModel.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(userId),
      role: MemberRole.ADMIN,
    });

    if (!member) {
      throw new ForbiddenException('You are not an admin of this team');
    }

    return member;
  }

  async verifyMatchTeamMember(userId: string, matchId: string): Promise<void> {
    const match = await this.teamMatchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    await this.verifyTeamMember(userId, match.teamId.toString());
  }

  async verifyMatchTeamAdmin(userId: string, matchId: string): Promise<void> {
    const match = await this.teamMatchModel.findById(matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    await this.verifyTeamAdmin(userId, match.teamId.toString());
  }
}

