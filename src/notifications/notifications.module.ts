import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

// Existing notifications
import { NotificationsService } from './notifications.service'
import { NotificationsResolver } from './notifications.resolver'
import { Notification, NotificationSchema } from './schemas/notification.schema'

// Smart notifications (Phase 7)
import {
  NotificationPreferences,
  NotificationPreferencesSchema,
} from './schemas/notification-preferences.schema'
import {
  SmartNotification,
  SmartNotificationSchema,
} from './schemas/smart-notification.schema'
import { NotificationDispatcherService } from './notification-dispatcher.service'
import { SmartNotificationsResolver } from './smart-notifications.resolver'
import { SmartNotificationJobs } from './jobs/smart-notification.jobs'

// Bull Queue
import { NotificationQueuesModule } from './queues/notification-queues.module'

// Workers
import { PushWorker } from './workers/push.worker'
import { TelegramWorker } from './workers/telegram.worker'
import { EmailWorker } from './workers/email.worker'

// Shared schemas
import { User, UserSchema } from '../users/schemas/user.schema'
import { PlatformLink, PlatformLinkSchema } from '../telegram/schemas/platform-link.schema'
import { Quiniela, QuinielaSchema } from '../quiniela/schemas/quiniela.schema'

// External modules (for cron jobs)
import { WorldcupModule } from '../worldcup/worldcup.module'

// PubSub provider (shared with streaming)
import { PubSub } from 'graphql-subscriptions'

const pubSubProvider = {
  provide: 'PUB_SUB',
  useValue: new PubSub(),
}

@Module({
  imports: [
    // Mongoose schemas
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: NotificationPreferences.name, schema: NotificationPreferencesSchema },
      { name: SmartNotification.name, schema: SmartNotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: PlatformLink.name, schema: PlatformLinkSchema },
      { name: Quiniela.name, schema: QuinielaSchema },
    ]),

    // Bull queues
    NotificationQueuesModule,

    // External modules (for WorldCup match data in cron jobs)
    WorldcupModule,
  ],
  providers: [
    // PubSub for GraphQL subscriptions
    pubSubProvider,

    // Existing notification service
    NotificationsService,
    NotificationsResolver,

    // Smart notification services
    NotificationDispatcherService,
    SmartNotificationsResolver,
    SmartNotificationJobs,

    // Workers
    PushWorker,
    TelegramWorker,
    EmailWorker,
  ],
  exports: [
    NotificationsService,
    NotificationDispatcherService,
    SmartNotificationJobs,
  ],
})
export class NotificationsModule {}
