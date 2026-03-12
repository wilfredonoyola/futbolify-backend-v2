// Telegram Controller - Webhook endpoint for Telegram bot

import { Controller, Post, Body, Get, Param, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  // ============ TEST ENDPOINTS (Development Only) ============

  /**
   * TEST: Trigger notification check manually
   * GET /telegram/test/notifications
   */
  @Get('test/notifications')
  async testNotifications() {
    await this.telegramService.checkUpcomingMatchesForNotifications();
    return {
      status: 'ok',
      message: 'Notification check triggered manually',
      note: 'Check bot logs for details'
    };
  }

  /**
   * TEST: Send match result notification
   * POST /telegram/test/result
   * Body: { matchId: "M01", homeScore: 2, awayScore: 1 }
   */
  @Post('test/result')
  async testMatchResult(@Body() body: { matchId: string; homeScore: number; awayScore: number }) {
    await this.telegramService.sendMatchResult(body.matchId, body.homeScore, body.awayScore);
    return {
      status: 'ok',
      message: `Result notification sent for match ${body.matchId}`,
      score: `${body.homeScore} - ${body.awayScore}`
    };
  }

  /**
   * TEST: Get upcoming matches (to know which matchIds to use)
   * GET /telegram/test/matches
   */
  @Get('test/matches')
  async testGetMatches() {
    const matches = this.telegramService.getUpcomingMatchesForTest();
    return {
      status: 'ok',
      count: matches.length,
      matches
    };
  }

  /**
   * TEST: Send direct message to a Telegram user
   * POST /telegram/test/message
   * Body: { telegramId: "123456789", message: "Test message" }
   */
  @Post('test/message')
  async testSendMessage(@Body() body: { telegramId: string; message: string }) {
    await this.telegramService.sendDirectMessage(body.telegramId, body.message);
    return {
      status: 'ok',
      message: `Message sent to ${body.telegramId}`
    };
  }

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
