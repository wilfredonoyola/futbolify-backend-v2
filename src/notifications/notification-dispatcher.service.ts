import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectQueue } from '@nestjs/bull'
import { Model, Types } from 'mongoose'
import { Queue } from 'bull'
import { PubSub } from 'graphql-subscriptions'
import { Inject } from '@nestjs/common'

import {
  SmartNotification,
  SmartNotificationDocument,
  DeliveryStatus,
  MatchContext,
  QuinielaContext,
  AIContext,
} from './schemas/smart-notification.schema'
import {
  NotificationPreferences,
  NotificationPreferencesDocument,
  SmartNotificationType,
  NotificationChannel,
  TypeChannelPreference,
} from './schemas/notification-preferences.schema'
import {
  NOTIFICATION_QUEUES,
  PushNotificationJob,
  TelegramNotificationJob,
  EmailNotificationJob,
} from './queues/notification-queues.module'
import { PlatformLink, PlatformLinkDocument } from '../telegram/schemas/platform-link.schema'

// PubSub event names
export const NOTIFICATION_EVENTS = {
  NOTIFICATION_RECEIVED: 'NOTIFICATION_RECEIVED',
} as const

// Input for creating a smart notification
export interface CreateSmartNotificationInput {
  userId: string
  type: SmartNotificationType
  title: string
  message: string
  shortMessage?: string
  imageUrl?: string
  actionUrl?: string
  matchContext?: Partial<MatchContext>
  quinielaContext?: Partial<QuinielaContext>
  aiContext?: Partial<AIContext>
  scheduledFor?: Date
  priority?: number
}

// Batch notification input (for sending to multiple users)
export interface BatchNotificationInput {
  userIds: string[]
  type: SmartNotificationType
  title: string
  message: string
  shortMessage?: string
  imageUrl?: string
  actionUrl?: string
  matchContext?: Partial<MatchContext>
  quinielaContext?: Partial<QuinielaContext>
  aiContext?: Partial<AIContext>
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name)

  constructor(
    @InjectModel(SmartNotification.name)
    private smartNotificationModel: Model<SmartNotificationDocument>,

    @InjectModel(NotificationPreferences.name)
    private preferencesModel: Model<NotificationPreferencesDocument>,

    @InjectModel(PlatformLink.name)
    private platformLinkModel: Model<PlatformLinkDocument>,

    @InjectQueue(NOTIFICATION_QUEUES.PUSH)
    private pushQueue: Queue<PushNotificationJob>,

    @InjectQueue(NOTIFICATION_QUEUES.TELEGRAM)
    private telegramQueue: Queue<TelegramNotificationJob>,

    @InjectQueue(NOTIFICATION_QUEUES.EMAIL)
    private emailQueue: Queue<EmailNotificationJob>,

    @Inject('PUB_SUB')
    private pubSub: PubSub,
  ) {}

  /**
   * Main dispatch method - creates notification and sends to enabled channels
   */
  async dispatch(input: CreateSmartNotificationInput): Promise<SmartNotification> {
    const { userId, type } = input

    // 1. Get user preferences
    const preferences = await this.getOrCreatePreferences(userId)

    // 2. Check if globally disabled
    if (!preferences.globalEnabled) {
      this.logger.debug(`Notifications globally disabled for user ${userId}`)
      return null
    }

    // 3. Check if this type is enabled for any channel
    const typePrefs = this.getTypePreferences(preferences, type)
    if (!typePrefs) {
      this.logger.debug(`Unknown notification type: ${type}`)
      return null
    }

    // 4. Create the notification record
    const notification = await this.createNotification(input, preferences, typePrefs)

    // 5. Dispatch to enabled channels
    await this.dispatchToChannels(notification, preferences, typePrefs)

    // 6. Publish to GraphQL subscription (in-app real-time)
    if (typePrefs.inApp && preferences.globalEnabled) {
      await this.publishToSubscription(notification)
    }

    return notification
  }

  /**
   * Batch dispatch to multiple users
   */
  async dispatchBatch(input: BatchNotificationInput): Promise<number> {
    const { userIds, ...notificationData } = input
    let sent = 0

    // Process in chunks to avoid memory issues
    const chunkSize = 100
    for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize)

      const promises = chunk.map(async (userId) => {
        try {
          const result = await this.dispatch({
            userId,
            ...notificationData,
          })
          if (result) sent++
        } catch (error) {
          this.logger.error(`Failed to dispatch to user ${userId}:`, error)
        }
      })

      await Promise.all(promises)
    }

    this.logger.log(`Batch dispatch completed: ${sent}/${userIds.length} notifications sent`)
    return sent
  }

  /**
   * Get or create default preferences for a user
   */
  async getOrCreatePreferences(userId: string): Promise<NotificationPreferences> {
    let preferences = await this.preferencesModel.findOne({
      userId: new Types.ObjectId(userId),
    })

    if (!preferences) {
      preferences = await this.preferencesModel.create({
        userId: new Types.ObjectId(userId),
      })
      this.logger.debug(`Created default preferences for user ${userId}`)
    }

    return preferences
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const preferences = await this.preferencesModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: updates },
      { new: true, upsert: true },
    )
    return preferences
  }

  /**
   * Get type-specific preferences
   */
  private getTypePreferences(
    preferences: NotificationPreferences,
    type: SmartNotificationType,
  ): TypeChannelPreference | null {
    const typeMap: Record<SmartNotificationType, keyof NotificationPreferences> = {
      [SmartNotificationType.MORNING_BRIEFING]: 'morningBriefing',
      [SmartNotificationType.PRE_MATCH_REMINDER]: 'preMatchReminder',
      [SmartNotificationType.POST_MATCH_RESULT]: 'postMatchResult',
      [SmartNotificationType.LIVE_GOAL]: 'postMatchResult', // Use same prefs
      [SmartNotificationType.RANKING_UPDATE]: 'rankingUpdate',
      [SmartNotificationType.PREDICTION_DEADLINE]: 'predictionDeadline',
      [SmartNotificationType.QUINIELA_INVITE]: 'predictionDeadline', // Use same prefs
      [SmartNotificationType.AI_INSIGHT]: 'aiInsight',
      [SmartNotificationType.AI_VS_YOU_UPDATE]: 'aiVsYouUpdate',
      [SmartNotificationType.FRIEND_JOINED]: 'rankingUpdate', // Use same prefs
      [SmartNotificationType.ACHIEVEMENT]: 'rankingUpdate', // Use same prefs
    }

    const prefKey = typeMap[type]
    if (!prefKey) return null

    return preferences[prefKey] as TypeChannelPreference
  }

  /**
   * Create notification record in database
   */
  private async createNotification(
    input: CreateSmartNotificationInput,
    preferences: NotificationPreferences,
    typePrefs: TypeChannelPreference,
  ): Promise<SmartNotification> {
    const notification = new this.smartNotificationModel({
      userId: new Types.ObjectId(input.userId),
      type: input.type,
      title: input.title,
      message: input.message,
      shortMessage: input.shortMessage || input.message.substring(0, 100),
      imageUrl: input.imageUrl,
      actionUrl: input.actionUrl,
      matchContext: input.matchContext,
      quinielaContext: input.quinielaContext,
      aiContext: input.aiContext,
      scheduledFor: input.scheduledFor,
      priority: input.priority || 5,

      // Set initial delivery status based on preferences
      pushDelivery: {
        status: typePrefs.push && preferences.push?.enabled
          ? DeliveryStatus.PENDING
          : DeliveryStatus.SKIPPED,
      },
      telegramDelivery: {
        status: typePrefs.telegram && preferences.telegram?.enabled
          ? DeliveryStatus.PENDING
          : DeliveryStatus.SKIPPED,
      },
      emailDelivery: {
        status: typePrefs.email && preferences.email?.enabled
          ? DeliveryStatus.PENDING
          : DeliveryStatus.SKIPPED,
      },
      inAppDelivery: {
        status: typePrefs.inApp
          ? DeliveryStatus.SENT // In-app is instant via subscription
          : DeliveryStatus.SKIPPED,
      },
    })

    return notification.save()
  }

  /**
   * Dispatch to enabled channels via Bull queues
   */
  private async dispatchToChannels(
    notification: SmartNotification,
    preferences: NotificationPreferences,
    typePrefs: TypeChannelPreference,
  ): Promise<void> {
    const userId = notification.userId.toString()
    const notificationId = notification._id.toString()

    // Check quiet hours (TODO: implement timezone-aware check)
    const isQuietHours = false // this.isInQuietHours(preferences)

    // Push notification
    if (typePrefs.push && preferences.push?.enabled && !isQuietHours) {
      await this.pushQueue.add(
        {
          notificationId,
          userId,
          title: notification.title,
          body: notification.shortMessage || notification.message,
          imageUrl: notification.imageUrl,
          actionUrl: notification.actionUrl,
          data: this.buildPushData(notification),
        },
        {
          priority: notification.priority,
          delay: notification.scheduledFor
            ? notification.scheduledFor.getTime() - Date.now()
            : 0,
        },
      )

      await this.updateDeliveryStatus(notificationId, 'push', DeliveryStatus.QUEUED)
    }

    // Telegram notification
    if (typePrefs.telegram && preferences.telegram?.enabled) {
      // Get user's Telegram chat ID
      const platformLink = await this.platformLinkModel.findOne({
        userId: new Types.ObjectId(userId),
        platform: 'TELEGRAM',
      })

      if (platformLink?.platformUserId) {
        await this.telegramQueue.add(
          {
            notificationId,
            userId,
            telegramChatId: platformLink.platformUserId,
            message: this.buildTelegramMessage(notification),
            parseMode: 'HTML',
            replyMarkup: this.buildTelegramKeyboard(notification),
          },
          {
            priority: notification.priority,
            delay: notification.scheduledFor
              ? notification.scheduledFor.getTime() - Date.now()
              : 0,
          },
        )

        await this.updateDeliveryStatus(notificationId, 'telegram', DeliveryStatus.QUEUED)
      } else {
        await this.updateDeliveryStatus(notificationId, 'telegram', DeliveryStatus.SKIPPED)
      }
    }

    // Email notification
    if (typePrefs.email && preferences.email?.enabled) {
      // Email is usually batched (daily/weekly), queue for later processing
      await this.emailQueue.add(
        {
          notificationId,
          userId,
          subject: notification.title,
          htmlContent: this.buildEmailHtml(notification),
          textContent: notification.message,
        },
        {
          priority: notification.priority + 5, // Lower priority for email
        },
      )

      await this.updateDeliveryStatus(notificationId, 'email', DeliveryStatus.QUEUED)
    }
  }

  /**
   * Publish to GraphQL subscription for real-time in-app
   */
  private async publishToSubscription(notification: SmartNotification): Promise<void> {
    try {
      await this.pubSub.publish(NOTIFICATION_EVENTS.NOTIFICATION_RECEIVED, {
        notificationReceived: notification,
      })
    } catch (error) {
      this.logger.error('Failed to publish to subscription:', error)
    }
  }

  /**
   * Update delivery status for a channel
   */
  private async updateDeliveryStatus(
    notificationId: string,
    channel: 'push' | 'telegram' | 'email' | 'inApp',
    status: DeliveryStatus,
    error?: string,
    externalId?: string,
  ): Promise<void> {
    const updateKey = `${channel}Delivery`
    await this.smartNotificationModel.findByIdAndUpdate(notificationId, {
      $set: {
        [`${updateKey}.status`]: status,
        [`${updateKey}.sentAt`]: status === DeliveryStatus.SENT ? new Date() : undefined,
        [`${updateKey}.error`]: error,
        [`${updateKey}.externalId`]: externalId,
      },
    })
  }

  /**
   * Build push notification data payload
   */
  private buildPushData(notification: SmartNotification): Record<string, string> {
    const data: Record<string, string> = {
      notificationId: notification._id.toString(),
      type: notification.type,
    }

    if (notification.actionUrl) {
      data.actionUrl = notification.actionUrl
    }

    if (notification.matchContext?.matchId) {
      data.matchId = notification.matchContext.matchId
    }

    if (notification.quinielaContext?.quinielaId) {
      data.quinielaId = notification.quinielaContext.quinielaId
    }

    return data
  }

  /**
   * Build Telegram message with HTML formatting
   */
  private buildTelegramMessage(notification: SmartNotification): string {
    let message = `<b>${notification.title}</b>\n\n${notification.message}`

    if (notification.matchContext) {
      const { homeTeamCode, awayTeamCode, homeScore, awayScore, matchDateUTC } = notification.matchContext

      if (homeScore !== undefined && awayScore !== undefined) {
        message += `\n\n⚽ <b>${homeTeamCode} ${homeScore} - ${awayScore} ${awayTeamCode}</b>`
      } else {
        message += `\n\n⚽ <b>${homeTeamCode} vs ${awayTeamCode}</b>`
      }
    }

    if (notification.aiContext?.aiPrediction) {
      message += `\n\n🤖 AI Prediction: ${notification.aiContext.aiPrediction}`
      if (notification.aiContext.aiConfidence) {
        message += ` (${notification.aiContext.aiConfidence}%)`
      }
    }

    return message
  }

  /**
   * Build Telegram inline keyboard
   */
  private buildTelegramKeyboard(notification: SmartNotification): any {
    if (!notification.actionUrl) return undefined

    return {
      inline_keyboard: [
        [
          {
            text: 'Ver en la app 📱',
            url: `${process.env.FRONTEND_URL}${notification.actionUrl}`,
          },
        ],
      ],
    }
  }

  /**
   * Build email HTML content
   */
  private buildEmailHtml(notification: SmartNotification): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            ${notification.imageUrl ? `
              <div style="width: 100%; height: 200px; overflow: hidden;">
                <img src="${notification.imageUrl}" alt="" style="width: 100%; height: 100%; object-fit: cover;">
              </div>
            ` : ''}
            <div style="padding: 24px;">
              <h1 style="margin: 0 0 8px; font-size: 20px; color: #1a1a1a;">
                ${notification.title}
              </h1>
              <p style="margin: 0 0 24px; font-size: 16px; color: #666; line-height: 1.5;">
                ${notification.message}
              </p>
              ${notification.actionUrl ? `
                <a href="${process.env.FRONTEND_URL}${notification.actionUrl}"
                   style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
                  Ver ahora
                </a>
              ` : ''}
            </div>
            <div style="padding: 16px 24px; background: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                Futbolify - Mundial 2026
              </p>
            </div>
          </div>
        </body>
      </html>
    `
  }

  /**
   * Get user's recent notifications
   */
  async getUserNotifications(userId: string, limit = 50): Promise<SmartNotification[]> {
    return this.smartNotificationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec()
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.smartNotificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    })
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<SmartNotification | null> {
    return this.smartNotificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true },
    )
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.smartNotificationModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    )
    return result.modifiedCount
  }
}
