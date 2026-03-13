import { Processor, Process, OnQueueFailed } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { Telegraf } from 'telegraf'

import { NOTIFICATION_QUEUES, TelegramNotificationJob } from '../queues/notification-queues.module'
import { SmartNotification, SmartNotificationDocument, DeliveryStatus } from '../schemas/smart-notification.schema'

/**
 * TelegramWorker - Processes Telegram bot messages
 *
 * Uses the existing Telegraf bot instance or creates a new one.
 * Sends notification messages to users who have linked their Telegram.
 */
@Processor(NOTIFICATION_QUEUES.TELEGRAM)
export class TelegramWorker {
  private readonly logger = new Logger(TelegramWorker.name)
  private bot: Telegraf | null = null

  constructor(
    @InjectModel(SmartNotification.name)
    private smartNotificationModel: Model<SmartNotificationDocument>,

    private configService: ConfigService,
  ) {
    this.initializeBot()
  }

  /**
   * Initialize Telegram bot
   */
  private initializeBot(): void {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN')

    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not configured - Telegram notifications disabled')
      return
    }

    this.bot = new Telegraf(token)
    this.logger.log('Telegram bot initialized for notifications')
  }

  @Process()
  async handleTelegram(job: Job<TelegramNotificationJob>): Promise<void> {
    const { notificationId, userId, telegramChatId, message, parseMode, replyMarkup } = job.data

    this.logger.debug(`Processing Telegram notification ${notificationId} for user ${userId}`)

    if (!this.bot) {
      this.logger.warn('Telegram bot not initialized')
      await this.updateDeliveryStatus(notificationId, DeliveryStatus.SKIPPED)
      return
    }

    if (!telegramChatId) {
      this.logger.debug(`No Telegram chat ID for user ${userId}`)
      await this.updateDeliveryStatus(notificationId, DeliveryStatus.SKIPPED)
      return
    }

    try {
      // Send message
      const result = await this.bot.telegram.sendMessage(telegramChatId, message, {
        parse_mode: parseMode || 'HTML',
        reply_markup: replyMarkup,
        link_preview_options: { is_disabled: true },
      })

      await this.updateDeliveryStatus(
        notificationId,
        DeliveryStatus.SENT,
        undefined,
        result.message_id.toString(),
      )

      this.logger.debug(`Telegram message sent to chat ${telegramChatId}: ${result.message_id}`)
    } catch (error) {
      this.logger.error(`Failed to send Telegram message to ${telegramChatId}:`, error)

      // Check if user blocked the bot
      if (error.code === 403 || error.description?.includes('blocked')) {
        await this.updateDeliveryStatus(
          notificationId,
          DeliveryStatus.SKIPPED,
          'User blocked the bot',
        )
        // Don't retry if user blocked
        return
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
  async handleFailed(job: Job<TelegramNotificationJob>, error: Error): Promise<void> {
    this.logger.error(`Telegram job ${job.id} failed after ${job.attemptsMade} attempts:`, error.message)

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
        'telegramDelivery.status': status,
        'telegramDelivery.sentAt': status === DeliveryStatus.SENT ? new Date() : undefined,
        'telegramDelivery.error': error,
        'telegramDelivery.externalId': externalId,
      },
    })
  }
}
