import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * Guard for betting Telegram commands
 * Only allows commands from ADMIN_TELEGRAM_ID
 */
@Injectable()
export class BettingTelegramGuard {
  private readonly logger = new Logger(BettingTelegramGuard.name)
  private readonly adminChatId: string

  constructor(private configService: ConfigService) {
    this.adminChatId = this.configService.get<string>('ADMIN_TELEGRAM_ID') || ''
    if (!this.adminChatId) {
      this.logger.warn('ADMIN_TELEGRAM_ID not configured - betting commands will be disabled')
    }
  }

  /**
   * Check if a chat ID is authorized for betting commands
   */
  isAdmin(chatId: string | number): boolean {
    if (!this.adminChatId) {
      return false
    }
    return String(chatId) === this.adminChatId
  }

  /**
   * Get the admin chat ID for sending alerts
   */
  getAdminChatId(): string | null {
    return this.adminChatId || null
  }

  /**
   * Middleware function for Telegraf
   * Returns true if authorized, false otherwise
   */
  checkAuth(ctx: any): boolean {
    const chatId = ctx.chat?.id || ctx.from?.id
    if (!chatId) {
      this.logger.debug('No chat ID found in context')
      return false
    }

    if (!this.isAdmin(chatId)) {
      this.logger.debug(`Unauthorized betting command attempt from ${chatId}`)
      return false
    }

    return true
  }
}
