import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { QueriesService } from './queries/queries.service';
import { ChatService } from './chat/chat.service';
import { MatchDto, MatchWithTeams } from './dto/match.dto';
import { TeamDto } from './dto/team.dto';
import { GroupDto, GroupWithTeams } from './dto/group.dto';
import { VenueDto } from './dto/venue.dto';
import { WorldcupChatInput, WorldcupChatResponse } from './dto/chat.dto';
import { ChatSession } from './schemas/chat-session.schema';

@Resolver()
export class WorldcupResolver {
  constructor(
    private readonly queriesService: QueriesService,
    private readonly chatService: ChatService,
  ) {}

  // ============ MATCH QUERIES ============

  @Query(() => [MatchDto], { name: 'worldcupMatches' })
  getMatches(
    @Args('teamId', { nullable: true }) teamId?: string,
    @Args('stage', { nullable: true }) stage?: string,
    @Args('date', { nullable: true }) date?: string,
    @Args('groupId', { nullable: true }) groupId?: string,
    @Args('venueId', { nullable: true }) venueId?: string,
  ) {
    let matches = this.queriesService.getAllMatches();

    if (teamId) {
      matches = matches.filter(
        (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
      );
    }
    if (stage) {
      matches = matches.filter((m) => m.stage === stage);
    }
    if (date) {
      matches = matches.filter((m) => m.dateTimeUTC.startsWith(date));
    }
    if (groupId) {
      matches = matches.filter((m) => m.groupId === groupId);
    }
    if (venueId) {
      matches = matches.filter((m) => m.venueId === venueId);
    }

    return matches;
  }

  @Query(() => MatchDto, { name: 'worldcupMatch', nullable: true })
  getMatch(@Args('id') id: string) {
    return this.queriesService.getMatchById(id);
  }

  @Query(() => [MatchWithTeams], { name: 'worldcupUpcomingMatches' })
  getUpcomingMatches(
    @Args('limit', { defaultValue: 5 }) limit: number,
    @Args('locale', { defaultValue: 'es' }) locale: 'es' | 'en',
  ) {
    return this.queriesService.getUpcomingMatchesWithTeams(limit, locale);
  }

  @Query(() => MatchWithTeams, { name: 'worldcupMatchWithTeams', nullable: true })
  getMatchWithTeams(
    @Args('id') id: string,
    @Args('locale', { defaultValue: 'es' }) locale: 'es' | 'en',
  ) {
    return this.queriesService.getMatchWithTeams(id, locale);
  }

  // ============ TEAM QUERIES ============

  @Query(() => [TeamDto], { name: 'worldcupTeams' })
  getTeams(
    @Args('groupId', { nullable: true }) groupId?: string,
    @Args('confederation', { nullable: true }) confederation?: string,
  ) {
    let teams = this.queriesService.getAllTeams();

    if (groupId) {
      teams = teams.filter((t) => t.groupId === groupId);
    }
    if (confederation) {
      teams = teams.filter((t) => t.confederation === confederation);
    }

    return teams;
  }

  @Query(() => TeamDto, { name: 'worldcupTeam', nullable: true })
  getTeam(@Args('id') id: string) {
    return this.queriesService.getTeamById(id);
  }

  @Query(() => TeamDto, { name: 'worldcupTeamByCode', nullable: true })
  getTeamByCode(@Args('code') code: string) {
    return this.queriesService.getTeamByCode(code);
  }

  // ============ GROUP QUERIES ============

  @Query(() => [GroupDto], { name: 'worldcupGroups' })
  getGroups() {
    return this.queriesService.getAllGroups();
  }

  @Query(() => GroupDto, { name: 'worldcupGroup', nullable: true })
  getGroup(@Args('id') id: string) {
    return this.queriesService.getGroupById(id);
  }

  @Query(() => GroupWithTeams, { name: 'worldcupGroupWithTeams', nullable: true })
  getGroupWithTeams(
    @Args('id') id: string,
    @Args('locale', { defaultValue: 'es' }) locale: 'es' | 'en',
  ) {
    return this.queriesService.getGroupWithTeams(id, locale);
  }

  // ============ VENUE QUERIES ============

  @Query(() => [VenueDto], { name: 'worldcupVenues' })
  getVenues(@Args('country', { nullable: true }) country?: string) {
    if (country) {
      return this.queriesService.getVenuesByCountry(country);
    }
    return this.queriesService.getAllVenues();
  }

  @Query(() => VenueDto, { name: 'worldcupVenue', nullable: true })
  getVenue(@Args('id') id: string) {
    return this.queriesService.getVenueById(id);
  }

  // ============ CHAT MUTATIONS ============

  @Mutation(() => WorldcupChatResponse, { name: 'worldcupChat' })
  async chat(
    @Args('input') input: WorldcupChatInput,
    @Context() context: { req?: { user?: { _id?: string } } },
  ): Promise<WorldcupChatResponse> {
    // Extract user ID from context if authenticated
    const userId = context.req?.user?._id;
    return this.chatService.chat(input, userId);
  }

  // ============ CHAT SESSION QUERIES ============

  @Query(() => ChatSession, { name: 'worldcupChatSession', nullable: true })
  async getChatSession(
    @Args('sessionId') sessionId: string,
  ): Promise<ChatSession | null> {
    return this.chatService.getSessionHistory(sessionId);
  }

  @Mutation(() => Boolean, { name: 'worldcupClearChatSession' })
  async clearChatSession(
    @Args('sessionId') sessionId: string,
  ): Promise<boolean> {
    return this.chatService.clearSession(sessionId);
  }

  @Mutation(() => ChatSession, { name: 'worldcupUpdateFavoriteTeams', nullable: true })
  async updateFavoriteTeams(
    @Args('sessionId') sessionId: string,
    @Args('favoriteTeams', { type: () => [String] }) favoriteTeams: string[],
  ): Promise<ChatSession | null> {
    return this.chatService.updateFavoriteTeams(sessionId, favoriteTeams);
  }
}
