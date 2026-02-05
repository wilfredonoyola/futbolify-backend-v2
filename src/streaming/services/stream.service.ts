import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { PubSub } from 'graphql-subscriptions'
import { v4 as uuidv4 } from 'uuid'
import { Stream, StreamDocument, StreamStatus } from '../schemas/stream.schema'
import {
  StreamAnalytics,
  StreamAnalyticsDocument,
} from '../schemas/stream-analytics.schema'
import { CreateStreamInput } from '../dto/create-stream.input'
import { UpdateStreamInput } from '../dto/update-stream.input'
import { UpdateScoreInput } from '../dto/update-score.input'
import { PUB_SUB } from '../providers/pubsub.provider'

export const VIEWER_COUNT_UPDATED = 'viewerCountUpdated'
export const SCORE_UPDATED = 'scoreUpdated'
export const STREAM_STATUS_CHANGED = 'streamStatusChanged'

@Injectable()
export class StreamService {
  constructor(
    @InjectModel(Stream.name) private streamModel: Model<StreamDocument>,
    @InjectModel(StreamAnalytics.name)
    private analyticsModel: Model<StreamAnalyticsDocument>,
    @Inject(PUB_SUB) private pubSub: PubSub,
  ) {}

  async createStream(
    userId: string,
    input: CreateStreamInput,
  ): Promise<StreamDocument> {
    const streamKey = this.generateStreamKey()
    const rtmpUrl = `${process.env.RTMP_SERVER_URL || 'rtmp://localhost/live'}/${streamKey}`

    const stream = await this.streamModel.create({
      ...input,
      userId: new Types.ObjectId(userId),
      streamKey,
      rtmpUrl,
      status: StreamStatus.SCHEDULED,
    })

    await this.analyticsModel.create({
      streamId: stream._id,
    })

    return stream
  }

  async getStream(id: string): Promise<StreamDocument> {
    const stream = await this.streamModel.findById(id)
    if (!stream) {
      throw new NotFoundException('Stream not found')
    }
    return stream
  }

  async getStreams(status?: StreamStatus): Promise<StreamDocument[]> {
    const filter = status ? { status } : {}
    return this.streamModel.find(filter).sort({ createdAt: -1 })
  }

  async getLiveStreams(): Promise<StreamDocument[]> {
    return this.streamModel
      .find({ status: StreamStatus.LIVE })
      .sort({ viewerCount: -1, startedAt: -1 })
  }

  async getMyStreams(userId: string): Promise<StreamDocument[]> {
    return this.streamModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
  }

  async updateStream(
    id: string,
    userId: string,
    input: UpdateStreamInput,
  ): Promise<StreamDocument> {
    const stream = await this.getStream(id)

    if (stream.userId.toString() !== userId) {
      throw new ForbiddenException('You do not own this stream')
    }

    Object.assign(stream, input)
    await stream.save()
    return stream
  }

  async startStream(id: string, userId: string): Promise<StreamDocument> {
    const stream = await this.getStream(id)

    if (stream.userId.toString() !== userId) {
      throw new ForbiddenException('You do not own this stream')
    }

    if (stream.status === StreamStatus.LIVE) {
      return stream
    }

    stream.status = StreamStatus.LIVE
    stream.startedAt = new Date()
    stream.hlsUrl = `${process.env.HLS_SERVER_URL || 'https://localhost/hls'}/${stream.streamKey}/index.m3u8`
    await stream.save()

    this.pubSub.publish(STREAM_STATUS_CHANGED, {
      streamStatusChanged: {
        streamId: id,
        status: StreamStatus.LIVE,
        startedAt: stream.startedAt,
      },
    })

    return stream
  }

  async endStream(id: string, userId: string): Promise<StreamDocument> {
    const stream = await this.getStream(id)

    if (stream.userId.toString() !== userId) {
      throw new ForbiddenException('You do not own this stream')
    }

    if (stream.status === StreamStatus.ENDED) {
      return stream
    }

    stream.status = StreamStatus.ENDED
    stream.endedAt = new Date()
    await stream.save()

    if (stream.startedAt) {
      const durationSeconds = Math.floor(
        (stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000,
      )
      await this.analyticsModel.findOneAndUpdate(
        { streamId: stream._id },
        { durationSeconds },
      )
    }

    this.pubSub.publish(STREAM_STATUS_CHANGED, {
      streamStatusChanged: {
        streamId: id,
        status: StreamStatus.ENDED,
        endedAt: stream.endedAt,
      },
    })

    return stream
  }

  async updateScore(input: UpdateScoreInput, userId: string): Promise<StreamDocument> {
    const stream = await this.getStream(input.streamId)

    if (stream.userId.toString() !== userId) {
      throw new ForbiddenException('You do not own this stream')
    }

    stream.homeScore = input.homeScore
    stream.awayScore = input.awayScore
    await stream.save()

    this.pubSub.publish(SCORE_UPDATED, {
      scoreUpdated: {
        streamId: input.streamId,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        homeTeam: stream.homeTeam,
        awayTeam: stream.awayTeam,
      },
    })

    return stream
  }

  async joinStream(streamId: string, userId?: string): Promise<StreamDocument> {
    const stream = await this.streamModel.findByIdAndUpdate(
      streamId,
      { $inc: { viewerCount: 1 } },
      { new: true },
    )

    if (!stream) {
      throw new NotFoundException('Stream not found')
    }

    if (stream.viewerCount > 0) {
      await this.analyticsModel.findOneAndUpdate(
        { streamId: stream._id },
        {
          $inc: { totalViews: 1 },
          $max: { peakViewers: stream.viewerCount },
          ...(userId && { $addToSet: { uniqueViewerIds: userId } }),
        },
      )

      if (userId) {
        await this.analyticsModel.findOneAndUpdate(
          { streamId: stream._id },
          [
            {
              $set: {
                uniqueViewers: { $size: '$uniqueViewerIds' },
              },
            },
          ],
        )
      }
    }

    this.pubSub.publish(VIEWER_COUNT_UPDATED, {
      viewerCountUpdated: {
        streamId,
        viewerCount: stream.viewerCount,
      },
    })

    return stream
  }

  async leaveStream(streamId: string): Promise<StreamDocument> {
    const stream = await this.streamModel.findByIdAndUpdate(
      streamId,
      { $inc: { viewerCount: -1 } },
      { new: true },
    )

    if (!stream) {
      throw new NotFoundException('Stream not found')
    }

    if (stream.viewerCount < 0) {
      stream.viewerCount = 0
      await stream.save()
    }

    this.pubSub.publish(VIEWER_COUNT_UPDATED, {
      viewerCountUpdated: {
        streamId,
        viewerCount: stream.viewerCount,
      },
    })

    return stream
  }

  async validateStreamKey(streamKey: string): Promise<StreamDocument | null> {
    return this.streamModel.findOne({ streamKey })
  }

  async startStreamByKey(streamKey: string): Promise<StreamDocument | null> {
    const stream = await this.streamModel.findOne({ streamKey })
    if (!stream) {
      return null
    }

    stream.status = StreamStatus.LIVE
    stream.startedAt = new Date()
    stream.hlsUrl = `${process.env.HLS_SERVER_URL || 'https://localhost/hls'}/${streamKey}/index.m3u8`
    await stream.save()

    this.pubSub.publish(STREAM_STATUS_CHANGED, {
      streamStatusChanged: {
        streamId: stream._id.toString(),
        status: StreamStatus.LIVE,
        startedAt: stream.startedAt,
      },
    })

    return stream
  }

  async endStreamByKey(streamKey: string): Promise<StreamDocument | null> {
    const stream = await this.streamModel.findOne({ streamKey })
    if (!stream) {
      return null
    }

    stream.status = StreamStatus.ENDED
    stream.endedAt = new Date()
    await stream.save()

    if (stream.startedAt) {
      const durationSeconds = Math.floor(
        (stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000,
      )
      await this.analyticsModel.findOneAndUpdate(
        { streamId: stream._id },
        { durationSeconds },
      )
    }

    this.pubSub.publish(STREAM_STATUS_CHANGED, {
      streamStatusChanged: {
        streamId: stream._id.toString(),
        status: StreamStatus.ENDED,
        endedAt: stream.endedAt,
      },
    })

    return stream
  }

  async deleteStream(id: string, userId: string): Promise<boolean> {
    const stream = await this.getStream(id)

    if (stream.userId.toString() !== userId) {
      throw new ForbiddenException('You do not own this stream')
    }

    await this.streamModel.findByIdAndDelete(id)
    await this.analyticsModel.findOneAndDelete({ streamId: new Types.ObjectId(id) })

    return true
  }

  async regenerateStreamKey(userId: string): Promise<string> {
    const newStreamKey = this.generateStreamKey()

    const streams = await this.streamModel.find({
      userId: new Types.ObjectId(userId),
      status: { $ne: StreamStatus.ENDED },
    })

    for (const stream of streams) {
      stream.streamKey = newStreamKey
      stream.rtmpUrl = `${process.env.RTMP_SERVER_URL || 'rtmp://localhost/live'}/${newStreamKey}`
      await stream.save()
    }

    return newStreamKey
  }

  async getStreamAnalytics(streamId: string): Promise<StreamAnalyticsDocument | null> {
    return this.analyticsModel.findOne({ streamId: new Types.ObjectId(streamId) })
  }

  private generateStreamKey(): string {
    return `stream_${uuidv4().replace(/-/g, '')}`
  }
}
