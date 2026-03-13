import { Processor, Process, OnQueueFailed } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

import { NOTIFICATION_QUEUES, EmailNotificationJob } from '../queues/notification-queues.module'
import { SmartNotification, SmartNotificationDocument, DeliveryStatus } from '../schemas/smart-notification.schema'
import { User, UserDocument } from '../../users/schemas/user.schema'

/**
 * EmailWorker - Processes email notifications via AWS SES
 *
 * Handles:
 * - Immediate emails (for high-priority notifications)
 * - Queued emails (for daily/weekly digests)
 */
@Processor(NOTIFICATION_QUEUES.EMAIL)
export class EmailWorker {
  private readonly logger = new Logger(EmailWorker.name)
  private sesClient: SESClient | null = null
  private fromEmail: string

  constructor(
    @InjectModel(SmartNotification.name)
    private smartNotificationModel: Model<SmartNotificationDocument>,

    @InjectModel(User.name)
    private userModel: Model<UserDocument>,

    private configService: ConfigService,
  ) {
    this.initializeSES()
  }

  /**
   * Initialize AWS SES client
   */
  private initializeSES(): void {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1')
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID')
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY')

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn('AWS credentials not configured - email notifications disabled')
      return
    }

    this.sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    this.fromEmail = this.configService.get<string>('SES_FROM_EMAIL', 'noreply@futbolify.com')
    this.logger.log('AWS SES initialized for email notifications')
  }

  @Process()
  async handleEmail(job: Job<EmailNotificationJob>): Promise<void> {
    const { notificationId, userId, email, subject, htmlContent, textContent } = job.data

    this.logger.debug(`Processing email notification ${notificationId} for user ${userId}`)

    if (!this.sesClient) {
      this.logger.warn('SES client not initialized')
      await this.updateDeliveryStatus(notificationId, DeliveryStatus.SKIPPED)
      return
    }

    try {
      // Get user email if not provided
      let toEmail = email
      if (!toEmail) {
        const user = await this.userModel.findById(userId)
        toEmail = user?.email
      }

      if (!toEmail) {
        this.logger.debug(`No email address for user ${userId}`)
        await this.updateDeliveryStatus(notificationId, DeliveryStatus.SKIPPED)
        return
      }

      // Check environment - don't send in development
      const isProduction = this.configService.get<string>('NODE_ENV') === 'production'

      if (!isProduction) {
        this.logger.debug(`[DEV] Would send email to ${toEmail}: ${subject}`)
        await this.updateDeliveryStatus(notificationId, DeliveryStatus.SENT)
        return
      }

      // Send email via SES
      const command = new SendEmailCommand({
        Source: this.fromEmail,
        Destination: {
          ToAddresses: [toEmail],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlContent,
              Charset: 'UTF-8',
            },
            ...(textContent && {
              Text: {
                Data: textContent,
                Charset: 'UTF-8',
              },
            }),
          },
        },
      })

      const result = await this.sesClient.send(command)

      await this.updateDeliveryStatus(
        notificationId,
        DeliveryStatus.SENT,
        undefined,
        result.MessageId,
      )

      this.logger.debug(`Email sent to ${toEmail}: ${result.MessageId}`)
    } catch (error) {
      this.logger.error(`Failed to send email for notification ${notificationId}:`, error)

      // Check for bounce/complaint
      if (error.code === 'MessageRejected') {
        await this.updateDeliveryStatus(
          notificationId,
          DeliveryStatus.FAILED,
          'Email rejected by SES',
        )
        return // Don't retry rejected emails
      }

      await this.updateDeliveryStatus(
        notificationId,
        DeliveryStatus.FAILED,
        error.message,
      )
      throw error // Let Bull handle retry
    }
  }

  @OnQueueFailed()
  async handleFailed(job: Job<EmailNotificationJob>, error: Error): Promise<void> {
    this.logger.error(`Email job ${job.id} failed after ${job.attemptsMade} attempts:`, error.message)

    if (job.attemptsMade >= (job.opts.attempts || 3)) {
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
        'emailDelivery.status': status,
        'emailDelivery.sentAt': status === DeliveryStatus.SENT ? new Date() : undefined,
        'emailDelivery.error': error,
        'emailDelivery.externalId': externalId,
      },
    })
  }
}
