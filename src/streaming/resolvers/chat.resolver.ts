import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  Int,
  Subscription,
} from '@nestjs/graphql'
import { UseGuards, Inject } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'
import { Message } from '../schemas/message.schema'
import { ChatService, MESSAGE_ADDED } from '../services/chat.service'
import { SendMessageInput } from '../dto/send-message.input'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { CurrentUser } from '../../auth/current-user.decorator'
import { User } from '../../users/schemas/user.schema'
import { PUB_SUB } from '../providers/pubsub.provider'

@Resolver(() => Message)
export class ChatResolver {
  constructor(
    private readonly chatService: ChatService,
    @Inject(PUB_SUB) private pubSub: PubSub,
  ) {}

  @Query(() => [Message])
  async messages(
    @Args('streamId', { type: () => ID }) streamId: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 })
    limit?: number,
    @Args('offset', { type: () => Int, nullable: true, defaultValue: 0 })
    offset?: number,
  ): Promise<Message[]> {
    return this.chatService.getMessages(streamId, limit, offset)
  }

  @Mutation(() => Message)
  @UseGuards(GqlAuthGuard)
  async sendMessage(
    @Args('input') input: SendMessageInput,
    @CurrentUser() user: User,
  ): Promise<Message> {
    return this.chatService.sendMessage(input, user.userId, user.userName)
  }

  @Subscription(() => Message, {
    filter: (payload, variables) =>
      payload.messageAdded.streamId === variables.streamId,
  })
  messageAdded(@Args('streamId', { type: () => ID }) streamId: string) {
    return this.pubSub.asyncIterator(MESSAGE_ADDED)
  }
}
