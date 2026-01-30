import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { Stream, StreamSchema } from './schemas/stream.schema'
import { Message, MessageSchema } from './schemas/message.schema'
import {
  UserSubscription,
  UserSubscriptionSchema,
} from './schemas/subscription.schema'
import {
  StreamAnalytics,
  StreamAnalyticsSchema,
} from './schemas/stream-analytics.schema'

import { pubSubProvider } from './providers/pubsub.provider'

import { StreamService } from './services/stream.service'
import { ChatService } from './services/chat.service'
import { SubscriptionService } from './services/subscription.service'

import { StreamResolver } from './resolvers/stream.resolver'
import { ChatResolver } from './resolvers/chat.resolver'
import { SubscriptionResolver } from './resolvers/subscription.resolver'

import { StreamingWebhookController } from './controllers/streaming-webhook.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Stream.name, schema: StreamSchema },
      { name: Message.name, schema: MessageSchema },
      { name: UserSubscription.name, schema: UserSubscriptionSchema },
      { name: StreamAnalytics.name, schema: StreamAnalyticsSchema },
    ]),
  ],
  controllers: [StreamingWebhookController],
  providers: [
    pubSubProvider,
    StreamService,
    ChatService,
    SubscriptionService,
    StreamResolver,
    ChatResolver,
    SubscriptionResolver,
  ],
  exports: [StreamService, ChatService, SubscriptionService],
})
export class StreamingModule {}
