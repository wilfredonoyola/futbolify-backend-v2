// Telegram Controller - Webhook endpoint for Telegram bot

import { Controller, Post, Body, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  /**
   * Webhook endpoint for Telegram updates
   * Configure in Telegram: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_URL>/telegram/webhook
   */
  @Post('webhook')
  async handleWebhook(@Body() update: any, @Res() res: Response) {
    try {
      this.telegramService.handleWebhook(update);
      return res.status(HttpStatus.OK).send('OK');
    } catch (error) {
      console.error('Telegram webhook error:', error);
      return res.status(HttpStatus.OK).send('OK'); // Always return OK to Telegram
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  healthCheck() {
    return { status: 'ok', service: 'telegram-bot' };
  }
}
