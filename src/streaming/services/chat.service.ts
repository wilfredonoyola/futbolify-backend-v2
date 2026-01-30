import { Injectable, Inject } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { PubSub } from 'graphql-subscriptions'
import { Message, MessageDocument, MessageType } from '../schemas/message.schema'
import {
  StreamAnalytics,
  StreamAnalyticsDocument,
} from '../schemas/stream-analytics.schema'
import { SendMessageInput } from '../dto/send-message.input'
import { PUB_SUB } from '../providers/pubsub.provider'

export const MESSAGE_ADDED = 'messageAdded'

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(StreamAnalytics.name)
    private analyticsModel: Model<StreamAnalyticsDocument>,
    @Inject(PUB_SUB) private pubSub: PubSub,
  ) {}

  async sendMessage(
    input: SendMessageInput,
    userId: string,
    userName: string,
  ): Promise<MessageDocument> {
    const message = await this.messageModel.create({
      streamId: new Types.ObjectId(input.streamId),
      userId: new Types.ObjectId(userId),
      userName,
      content: input.content,
      type: input.type || MessageType.TEXT,
    })

    await this.analyticsModel.findOneAndUpdate(
      { streamId: new Types.ObjectId(input.streamId) },
      { $inc: { totalMessages: 1 } },
    )

    this.pubSub.publish(MESSAGE_ADDED, {
      messageAdded: {
        id: message._id.toString(),
        streamId: input.streamId,
        userId,
        userName,
        content: input.content,
        type: message.type,
        createdAt: message.createdAt,
      },
    })

    return message
  }

  async getMessages(
    streamId: string,
    limit = 50,
    offset = 0,
  ): Promise<MessageDocument[]> {
    return this.messageModel
      .find({ streamId: new Types.ObjectId(streamId) })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
  }

  async sendSystemMessage(
    streamId: string,
    content: string,
  ): Promise<MessageDocument> {
    const message = await this.messageModel.create({
      streamId: new Types.ObjectId(streamId),
      userId: new Types.ObjectId('000000000000000000000000'),
      userName: 'System',
      content,
      type: MessageType.SYSTEM,
    })

    this.pubSub.publish(MESSAGE_ADDED, {
      messageAdded: {
        id: message._id.toString(),
        streamId,
        userId: '000000000000000000000000',
        userName: 'System',
        content,
        type: MessageType.SYSTEM,
        createdAt: message.createdAt,
      },
    })

    return message
  }

  async deleteMessagesForStream(streamId: string): Promise<void> {
    await this.messageModel.deleteMany({ streamId: new Types.ObjectId(streamId) })
  }
}
