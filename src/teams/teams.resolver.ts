import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentUserPayload } from '../auth/current-user-payload.interface';
import { Team } from './schemas/team.schema';
import { TeamMember, MemberRole } from './schemas/team-member.schema';
import { TeamMatch } from './schemas/team-match.schema';
import {
  CreateTeamInput,
  UpdateTeamInput,
  CreateMatchInput,
  UpdateMatchInput,
  TeamWithMembers,
} from './dto';

@Resolver(() => Team)
export class TeamsResolver {
  constructor(private readonly teamsService: TeamsService) {}

  // ============== QUERIES ==============

  @Query(() => [Team], { name: 'myTeams' })
  @UseGuards(GqlAuthGuard)
  async getMyTeams(@CurrentUser() user: CurrentUserPayload): Promise<Team[]> {
    return this.teamsService.getMyTeams(user.userId);
  }

  @Query(() => TeamWithMembers, { name: 'team' })
  @UseGuards(GqlAuthGuard)
  async getTeam(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TeamWithMembers> {
    const team = await this.teamsService.getTeam(id, user.userId);
    const members = await this.teamsService.getTeamMembersWithUser(id, user.userId);
    return {
      ...team,
      members,
    } as any;
  }

  @Query(() => Team, { name: 'teamByCode' })
  @UseGuards(GqlAuthGuard)
  async getTeamByCode(@Args('code') code: string): Promise<Team> {
    return this.teamsService.getTeamByCode(code);
  }

  @Query(() => [TeamMember], { name: 'teamMembers' })
  @UseGuards(GqlAuthGuard)
  async getTeamMembers(
    @Args('teamId', { type: () => ID }) teamId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TeamMember[]> {
    return this.teamsService.getTeamMembers(teamId, user.userId);
  }

  @Query(() => [TeamMatch], { name: 'teamMatches' })
  @UseGuards(GqlAuthGuard)
  async getTeamMatches(
    @Args('teamId', { type: () => ID }) teamId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TeamMatch[]> {
    return this.teamsService.getTeamMatches(teamId, user.userId);
  }

  @Query(() => TeamMatch, { name: 'teamMatch' })
  @UseGuards(GqlAuthGuard)
  async getMatch(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TeamMatch> {
    return this.teamsService.getMatch(id, user.userId);
  }

  // ============== MUTATIONS - TEAMS ==============

  @Mutation(() => Team)
  @UseGuards(GqlAuthGuard)
  async createTeam(
    @Args('input') input: CreateTeamInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Team> {
    return this.teamsService.createTeam(user.userId, input);
  }

  @Mutation(() => Team)
  @UseGuards(GqlAuthGuard)
  async updateTeam(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateTeamInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Team> {
    return this.teamsService.updateTeam(id, user.userId, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteTeam(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.teamsService.deleteTeam(id, user.userId);
  }

  // ============== MUTATIONS - MEMBERS ==============

  @Mutation(() => Team)
  @UseGuards(GqlAuthGuard)
  async joinTeam(
    @Args('code') code: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<Team> {
    return this.teamsService.joinTeam(user.userId, code);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async leaveTeam(
    @Args('teamId', { type: () => ID }) teamId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.teamsService.leaveTeam(user.userId, teamId);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async removeTeamMember(
    @Args('teamId', { type: () => ID }) teamId: string,
    @Args('userId', { type: () => ID }) memberUserId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.teamsService.removeTeamMember(user.userId, teamId, memberUserId);
  }

  @Mutation(() => TeamMember)
  @UseGuards(GqlAuthGuard)
  async updateMemberRole(
    @Args('teamId', { type: () => ID }) teamId: string,
    @Args('userId', { type: () => ID }) memberUserId: string,
    @Args('role', { type: () => String }) role: MemberRole,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TeamMember> {
    return this.teamsService.updateMemberRole(user.userId, teamId, memberUserId, role);
  }

  // ============== MUTATIONS - MATCHES ==============

  @Mutation(() => TeamMatch)
  @UseGuards(GqlAuthGuard)
  async createMatch(
    @Args('input') input: CreateMatchInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TeamMatch> {
    return this.teamsService.createMatch(user.userId, input);
  }

  @Mutation(() => TeamMatch)
  @UseGuards(GqlAuthGuard)
  async updateMatch(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateMatchInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TeamMatch> {
    return this.teamsService.updateMatch(id, user.userId, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteMatch(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.teamsService.deleteMatch(id, user.userId);
  }
}

