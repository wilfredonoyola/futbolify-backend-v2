import { Processor, Process, OnQueueFailed } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { ConfigService } from '@nestjs/config'

import { NOTIFICATION_QUEUES, PushNotificationJob } from '../queues/notification-queues.module'
import { SmartNotification, SmartNotificationDocument, DeliveryStatus } from '../schemas/smart-notification.schema'
import { User, UserDocument } from '../../users/schemas/user.schema'

/**
 * PushWorker - Processes push notifications via FCM
 *
 * Handles:
 * - Web push (PWA)
 * - Mobile push (Flutter via FCM)
 *
 * Prerequisites:
 * - Firebase Admin SDK configured
 * - User has FCM token stored in profile
 */
@Processor(NOTIFICATION_QUEUES.PUSH)
export class PushWorker {
  private readonly logger = new Logger(PushWorker.name)
  private firebaseAdmin: any = null

  constructor(
    @InjectModel(SmartNotification.name)
    private smartNotificationModel: Model<SmartNotificationDocument>,

    @InjectModel(User.name)
    private userModel: Model<UserDocument>,

    private configService: ConfigService,
  ) {
    this.initializeFirebase()
  }

  /**
   * Initialize Firebase Admin SDK
   */
  private async initializeFirebase(): Promise<void> {
    try {
      const firebaseConfig = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT')

      if (!firebaseConfig) {
        this.logger.warn('FIREBASE_SERVICE_ACCOUNT not configured - push notifications disabled')
        return
      }

      // Dynamic import to avoid issues if firebase-admin not installed
      const admin = await import('firebase-admin')

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(firebaseConfig)),
        })
      }

      this.firebaseAdmin = admin
      this.logger.log('Firebase Admin SDK initialized')
    } catch (error) {
      this.logger.error('Failed to initialize Firebase:', error)
    }
  }

  @Process()
  async handlePush(job: Job<PushNotificationJob>): Promise<void> {
    const { notificationId, userId, title, body, imageUrl, data, actionUrl } = job.data

    this.logger.debug(`Processing push notification ${notificationId} for user ${userId}`)

    try {
      // Get user's FCM tokens
      const user = await this.userModel.findById(userId)

      if (!user) {
        throw new Error(`User ${userId} not found`)
      }

      // Check if user has FCM tokens
      const fcmTokens = (user as any).fcmTokens || []

      if (fcmTokens.length === 0) {
        this.logger.debug(`User ${userId} has no FCM tokens`)
        await this.updateDeliveryStatus(notificationId, DeliveryStatus.SKIPPED)
        return
      }

      if (!this.firebaseAdmin) {
        this.logger.warn('Firebase not initialized, skipping push')
        await this.updateDeliveryStatus(notificationId, DeliveryStatus.SKIPPED)
        return
      }

      // Build FCM message
      const message = {
        notification: {
          title,
          body,
          ...(imageUrl && { imageUrl }),
        },
        data: {
          ...data,
          click_action: actionUrl || '/',
        },
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'futbolify_notifications',
            icon: 'ic_notification',
            color: '#8b5cf6',
          },
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
              sound: 'default',
            },
          },
        },
        webpush: {
          notification: {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
          },
          fcmOptions: {
            link: actionUrl ? `${process.env.FRONTEND_URL}${actionUrl}` : process.env.FRONTEND_URL,
          },
        },
      }

      // Send to all user's tokens
      const results = await Promise.allSettled(
        fcmTokens.map((token: string) =>
          this.firebaseAdmin.messaging().send({
            ...message,
            token,
          }),
        ),
      )

      // Count successes and failures
      const successful = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      // Remove invalid tokens
      const invalidTokens: string[] = []
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const error = (result as PromiseRejectedResult).reason
          if (
            error?.code === 'messaging/invalid-registration-token' ||
            error?.code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(fcmTokens[index])
          }
        }
      })

      // Clean up invalid tokens
      if (invalidTokens.length > 0) {
        await this.userModel.findByIdAndUpdate(userId, {
          $pull: { fcmTokens: { $in: invalidTokens } },
        })
        this.logger.debug(`Removed ${invalidTokens.length} invalid FCM tokens for user ${userId}`)
      }

      if (successful > 0) {
        await this.updateDeliveryStatus(notificationId, DeliveryStatus.SENT)
        this.logger.debug(`Push sent to ${successful}/${fcmTokens.length} devices for user ${userId}`)
      } else {
        await this.updateDeliveryStatus(
          notificationId,
          DeliveryStatus.FAILED,
          `All ${failed} tokens failed`,
        )
      }
    } catch (error) {
      this.logger.error(`Failed to send push notification ${notificationId}:`, error)
      await this.updateDeliveryStatus(
        notificationId,
        DeliveryStatus.FAILED,
        error.message,
      )
      throw error // Let Bull handle retry
    }
  }

  @OnQueueFailed()
  async handleFailed(job: Job<PushNotificationJob>, error: Error): Promise<void> {
    this.logger.error(`Push job ${job.id} failed after ${job.attemptsMade} attempts:`, error.message)

    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      // Final failure
      await this.updateDeliveryStatus(
        job.data.notificationId,
        DeliveryStatus.FAILED,
        `Failed after ${job.attemptsMade} attempts: ${error.message}`,
      )
    }
  }

  private async updateDeliveryStatus(
    notificationId: string,
    status: DeliveryStatus,
    error?: string,
    externalId?: string,
  ): Promise<void> {
    await this.smartNotificationModel.findByIdAndUpdate(notificationId, {
      $set: {
        'pushDelivery.status': status,
        'pushDelivery.sentAt': status === DeliveryStatus.SENT ? new Date() : undefined,
        'pushDelivery.error': error,
        'pushDelivery.externalId': externalId,
      },
    })
  }
}
