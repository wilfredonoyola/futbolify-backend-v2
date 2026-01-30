import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  Subscription,
} from '@nestjs/graphql'
import { UseGuards, Inject } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'
import { Stream, StreamStatus } from '../schemas/stream.schema'
import { StreamAnalytics } from '../schemas/stream-analytics.schema'
import {
  StreamService,
  VIEWER_COUNT_UPDATED,
  SCORE_UPDATED,
  STREAM_STATUS_CHANGED,
} from '../services/stream.service'
import { CreateStreamInput } from '../dto/create-stream.input'
import { UpdateStreamInput } from '../dto/update-stream.input'
import { UpdateScoreInput } from '../dto/update-score.input'
import { ViewerCountUpdate } from '../dto/viewer-count-update.output'
import { ScoreUpdate } from '../dto/score-update.output'
import { StreamStatusUpdate } from '../dto/stream-status-update.output'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { CurrentUser } from '../../auth/current-user.decorator'
import { User } from '../../users/schemas/user.schema'
import { PUB_SUB } from '../providers/pubsub.provider'

@Resolver(() => Stream)
export class StreamResolver {
  constructor(
    private readonly streamService: StreamService,
    @Inject(PUB_SUB) private pubSub: PubSub,
  ) {}

  @Query(() => Stream)
  async stream(@Args('id', { type: () => ID }) id: string): Promise<Stream> {
    return this.streamService.getStream(id)
  }

  @Query(() => [Stream])
  async streams(
    @Args('status', { type: () => StreamStatus, nullable: true })
    status?: StreamStatus,
  ): Promise<Stream[]> {
    return this.streamService.getStreams(status)
  }

  @Query(() => [Stream])
  async liveStreams(): Promise<Stream[]> {
    return this.streamService.getLiveStreams()
  }

  @Query(() => [Stream])
  @UseGuards(GqlAuthGuard)
  async myStreams(@CurrentUser() user: User): Promise<Stream[]> {
    return this.streamService.getMyStreams(user.userId)
  }

  @Query(() => StreamAnalytics, { nullable: true })
  @UseGuards(GqlAuthGuard)
  async streamAnalytics(
    @Args('streamId', { type: () => ID }) streamId: string,
  ): Promise<StreamAnalytics | null> {
    return this.streamService.getStreamAnalytics(streamId)
  }

  @Mutation(() => Stream)
  @UseGuards(GqlAuthGuard)
  async createStream(
    @Args('input') input: CreateStreamInput,
    @CurrentUser() user: User,
  ): Promise<Stream> {
    return this.streamService.createStream(user.userId, input)
  }

  @Mutation(() => Stream)
  @UseGuards(GqlAuthGuard)
  async updateStream(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateStreamInput,
    @CurrentUser() user: User,
  ): Promise<Stream> {
    return this.streamService.updateStream(id, user.userId, input)
  }

  @Mutation(() => Stream)
  @UseGuards(GqlAuthGuard)
  async startStream(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User,
  ): Promise<Stream> {
    return this.streamService.startStream(id, user.userId)
  }

  @Mutation(() => Stream)
  @UseGuards(GqlAuthGuard)
  async endStream(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User,
  ): Promise<Stream> {
    return this.streamService.endStream(id, user.userId)
  }

  @Mutation(() => Stream)
  @UseGuards(GqlAuthGuard)
  async updateScore(
    @Args('input') input: UpdateScoreInput,
    @CurrentUser() user: User,
  ): Promise<Stream> {
    return this.streamService.updateScore(input, user.userId)
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteStream(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: User,
  ): Promise<boolean> {
    return this.streamService.deleteStream(id, user.userId)
  }

  @Mutation(() => Stream)
  @UseGuards(GqlAuthGuard)
  async joinStream(
    @Args('streamId', { type: () => ID }) streamId: string,
    @CurrentUser() user: User,
  ): Promise<Stream> {
    return this.streamService.joinStream(streamId, user.userId)
  }

  @Mutation(() => Stream)
  async leaveStream(
    @Args('streamId', { type: () => ID }) streamId: string,
  ): Promise<Stream> {
    return this.streamService.leaveStream(streamId)
  }

  @Mutation(() => String)
  @UseGuards(GqlAuthGuard)
  async regenerateStreamKey(@CurrentUser() user: User): Promise<string> {
    return this.streamService.regenerateStreamKey(user.userId)
  }

  @Subscription(() => ViewerCountUpdate, {
    filter: (payload, variables) =>
      payload.viewerCountUpdated.streamId === variables.streamId,
  })
  viewerCountUpdated(
    @Args('streamId', { type: () => ID }) streamId: string,
  ) {
    return this.pubSub.asyncIterator(VIEWER_COUNT_UPDATED)
  }

  @Subscription(() => ScoreUpdate, {
    filter: (payload, variables) =>
      payload.scoreUpdated.streamId === variables.streamId,
  })
  scoreUpdated(@Args('streamId', { type: () => ID }) streamId: string) {
    return this.pubSub.asyncIterator(SCORE_UPDATED)
  }

  @Subscription(() => StreamStatusUpdate, {
    filter: (payload, variables) =>
      payload.streamStatusChanged.streamId === variables.streamId,
  })
  streamStatusChanged(
    @Args('streamId', { type: () => ID }) streamId: string,
  ) {
    return this.pubSub.asyncIterator(STREAM_STATUS_CHANGED)
  }
}
