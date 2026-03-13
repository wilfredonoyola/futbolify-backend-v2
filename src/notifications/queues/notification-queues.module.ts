import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { ConfigModule, ConfigService } from '@nestjs/config'

// Queue names
export const NOTIFICATION_QUEUES = {
  PUSH: 'notification-push',
  TELEGRAM: 'notification-telegram',
  EMAIL: 'notification-email',
  SCHEDULER: 'notification-scheduler',
} as const

export type NotificationQueueName = typeof NOTIFICATION_QUEUES[keyof typeof NOTIFICATION_QUEUES]

/**
 * NotificationQueuesModule
 *
 * Configures Bull queues for async notification processing:
 * - Push: FCM notifications (web + mobile)
 * - Telegram: Bot messages
 * - Email: AWS SES emails
 * - Scheduler: Cron-triggered scheduled notifications
 */
@Module({
  imports: [
    // Register Bull with Redis connection
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL')

        if (redisUrl) {
          // Upstash/Valkey use rediss:// (TLS), detect and configure accordingly
          const isTLS = redisUrl.startsWith('rediss://')

          return {
            url: redisUrl,
            tls: isTLS ? { rejectUnauthorized: true } : undefined,
            maxRetriesPerRequest: null, // Required for Bull
            enableReadyCheck: false,
            defaultJobOptions: {
              removeOnComplete: 50,
              removeOnFail: 200,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            },
          }
        }

        // Fallback to individual config
        return {
          redis: {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6379),
            password: configService.get<string>('REDIS_PASSWORD'),
          },
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 500,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        }
      },
    }),

    // Register individual queues
    BullModule.registerQueue(
      {
        name: NOTIFICATION_QUEUES.PUSH,
        defaultJobOptions: {
          priority: 1, // High priority for push
        },
      },
      {
        name: NOTIFICATION_QUEUES.TELEGRAM,
        defaultJobOptions: {
          priority: 2,
        },
      },
      {
        name: NOTIFICATION_QUEUES.EMAIL,
        defaultJobOptions: {
          priority: 3, // Lower priority for email
        },
      },
      {
        name: NOTIFICATION_QUEUES.SCHEDULER,
        defaultJobOptions: {
          priority: 2,
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class NotificationQueuesModule {}

// Job payload types
export interface PushNotificationJob {
  notificationId: string
  userId: string
  title: string
  body: string
  imageUrl?: string
  data?: Record<string, string>
  actionUrl?: string
}

export interface TelegramNotificationJob {
  notificationId: string
  userId: string
  telegramChatId?: string // If known, send directly
  message: string
  parseMode?: 'HTML' | 'Markdown'
  replyMarkup?: any // Telegram inline keyboard
}

export interface EmailNotificationJob {
  notificationId: string
  userId: string
  email?: string // If known
  subject: string
  htmlContent: string
  textContent?: string
}

export interface SchedulerJob {
  type: 'MORNING_BRIEFING' | 'PRE_MATCH_REMINDER' | 'POST_MATCH_RESULT'
  matchId?: string
  quinielaId?: string
  targetUserIds?: string[] // Specific users, or empty for all
  scheduledFor: Date
}
