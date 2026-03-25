import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { Telegraf, Markup } from 'telegraf'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import { BettingCombo, BettingComboDocument } from '../schemas/betting-combo.schema'
import {
  BettingDailySummary,
  BettingDailySummaryDocument,
} from '../schemas/betting-daily-summary.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import { PickStatus, ComboStatus, SteamMoveDirection } from '../enums/betting.enums'
import { BettingTelegramGuard } from './betting-telegram.guards'
import { BettingTelegramFormatters } from './betting-telegram.formatters'
import { BettingTelegramCommands } from './betting-telegram.commands'
import { BettingTelegramCallbacks } from './betting-telegram.callbacks'

/**
 * Main service for betting Telegram integration
 * Handles:
 * - Sending automated alerts (3 alerts per day)
 * - Registering commands with the bot
 * - Managing inline buttons for quick result registration
 */
@Injectable()
export class BettingTelegramService implements OnModuleInit {
  private readonly logger = new Logger(BettingTelegramService.name)
  private bot: Telegraf | null = null

  constructor(
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingDailySummary.name)
    private dailySummaryModel: Model<BettingDailySummaryDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    private configService: ConfigService,
    private guard: BettingTelegramGuard,
    private formatters: BettingTelegramFormatters,
    private commands: BettingTelegramCommands,
    private callbacks: BettingTelegramCallbacks
  ) {
    const token = this.configService.get<string>('BETTING_TELEGRAM_BOT_TOKEN')
    if (token) {
      this.bot = new Telegraf(token)
      this.logger.log('Betting Telegram service initialized (GolPicks bot)')
    } else {
      this.logger.warn('BETTING_TELEGRAM_BOT_TOKEN not set - betting alerts disabled')
    }
  }

  async onModuleInit() {
    if (this.bot) {
      this.registerCommands()
      this.registerCallbacks()
      this.logger.log('Betting Telegram commands registered')
    }
  }

  /**
   * Register betting commands with the bot
   */
  private registerCommands() {
    if (!this.bot) return

    // Quick picks summary
    this.bot.command('picks', (ctx) => this.commands.handlePicks(ctx))

    // Detailed picks
    this.bot.command('picks_full', (ctx) => this.commands.handlePicksFull(ctx))

    // Combos
    this.bot.command('combos', (ctx) => this.commands.handleCombos(ctx))

    // Bankroll status
    this.bot.command('bankroll', (ctx) => this.commands.handleBankroll(ctx))

    // Stats
    this.bot.command('stats', (ctx) => this.commands.handleStats(ctx))
    this.bot.command('stats_goals', (ctx) => this.commands.handleStatsGoals(ctx))
    this.bot.command('stats_corners', (ctx) => this.commands.handleStatsCorners(ctx))
    this.bot.command('stats_combos', (ctx) => this.commands.handleStatsCombos(ctx))

    // Streak
    this.bot.command('streak', (ctx) => this.commands.handleStreak(ctx))

    // Set bankroll
    this.bot.command('set_bankroll', (ctx) => this.commands.handleSetBankroll(ctx))

    // Pause/Resume
    this.bot.command('pause', (ctx) => this.commands.handlePause(ctx))
    this.bot.command('resume', (ctx) => this.commands.handleResume(ctx))

    // Leagues
    this.bot.command('leagues', (ctx) => this.commands.handleLeagues(ctx))

    // History
    this.bot.command('history', (ctx) => this.commands.handleHistory(ctx))

    // Best/Worst
    this.bot.command('best', (ctx) => this.commands.handleBest(ctx))
    this.bot.command('worst', (ctx) => this.commands.handleWorst(ctx))

    // Manual result registration
    this.bot.command('result', (ctx) => this.commands.handleResult(ctx))
    this.bot.command('result_combo', (ctx) => this.commands.handleResultCombo(ctx))

    // Force scan info
    this.bot.command('force_scan', async (ctx) => {
      if (!this.guard.checkAuth(ctx)) {
        await ctx.reply('No autorizado para comandos de betting')
        return
      }

      await ctx.reply(
        '📋 *Para ejecutar un scan manual:*\n\n' +
          '```\nnpm run betting:scan\n```\n\n' +
          'O espera el cron automático (9PM)',
        { parse_mode: 'Markdown' }
      )
    })
  }

  /**
   * Register callback query handlers for inline buttons
   */
  private registerCallbacks() {
    if (!this.bot) return

    this.bot.on('callback_query', async (ctx) => {
      const data = (ctx.callbackQuery as { data?: string }).data
      if (!data) return

      // Only handle betting-related callbacks
      if (data.startsWith('bet_') || data.startsWith('combo_')) {
        const result = await this.callbacks.handleCallback(ctx)
        if (result) {
          await ctx.answerCbQuery(result)
        }
      }
    })
  }

  /**
   * Send Alert 1: Nightly Analysis
   * Called by nightly-analysis.cron.ts
   *
   * @param alertType 'initial' = first alert of the day, 'update' = new picks added
   * @param totalPicks Total picks for the day (for context in updates)
   * @param totalCombos Total combos for the day
   */
  async sendNightlyAnalysisAlert(
    date: Date,
    picks: BettingPickDocument[],
    combos: BettingComboDocument[],
    fixturesAnalyzed: number,
    leaguesAnalyzed: number,
    alertType: 'initial' | 'update' = 'initial',
    totalPicks?: number,
    totalCombos?: number
  ): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      this.logger.warn('Cannot send nightly analysis alert - no admin chat ID or bot')
      return
    }

    try {
      // Check if alerts are enabled
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.telegramAlertsOn) {
        this.logger.log('Telegram alerts disabled - skipping nightly analysis alert')
        return
      }

      const bankroll = settings.bankroll || 100
      const totalExposure =
        picks.reduce((sum, p) => sum + (p.stake || 0), 0) +
        combos.reduce((sum, c) => sum + (c.stake || 0), 0)

      const message = this.formatters.formatNightlyAnalysisAlert(
        date,
        picks,
        combos,
        bankroll,
        totalExposure,
        fixturesAnalyzed,
        leaguesAnalyzed,
        alertType,
        totalPicks,
        totalCombos
      )

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
      })

      this.logger.log(`Nightly analysis alert (${alertType}) sent successfully`)
    } catch (error) {
      this.logger.error(`Failed to send nightly analysis alert: ${error}`)
    }
  }

  /**
   * Send Alert 2: Pre-Match Verification
   * Called by pre-match-check.cron.ts
   */
  async sendPreMatchAlert(
    picks: Array<{
      pick: BettingPickDocument
      status: 'confirmed' | 'steam_favorable' | 'steam_contra' | 'cancelled'
      newOdds?: number
      newEdge?: number
      confidenceChange?: number
      reason?: string
    }>,
    combos: Array<{
      combo: BettingComboDocument
      status: 'confirmed' | 'cancelled'
      reason?: string
    }>
  ): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      this.logger.warn('Cannot send pre-match alert - no admin chat ID or bot')
      return
    }

    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.telegramAlertsOn) {
        this.logger.log('Telegram alerts disabled - skipping pre-match alert')
        return
      }

      // Calculate exposure for confirmed picks/combos
      const totalExposure =
        picks
          .filter((p) => p.status === 'confirmed' || p.status === 'steam_favorable')
          .reduce((sum, p) => sum + (p.pick.stake || 0), 0) +
        combos
          .filter((c) => c.status === 'confirmed')
          .reduce((sum, c) => sum + (c.combo.stake || 0), 0)

      const message = this.formatters.formatPreMatchAlert(picks, combos, totalExposure)

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
      })

      this.logger.log('Pre-match alert sent successfully')
    } catch (error) {
      this.logger.error(`Failed to send pre-match alert: ${error}`)
    }
  }

  /**
   * Send Alert 3: Daily Results
   * Called by result-collector.cron.ts
   */
  async sendResultsAlert(
    date: Date,
    picks: BettingPickDocument[],
    combos: BettingComboDocument[]
  ): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      this.logger.warn('Cannot send results alert - no admin chat ID or bot')
      return
    }

    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.telegramAlertsOn) {
        this.logger.log('Telegram alerts disabled - skipping results alert')
        return
      }

      // Get yesterday's bankroll from daily summary
      const yesterday = new Date(date)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdaySummary = await this.dailySummaryModel
        .findOne({ date: yesterday })
        .exec()

      const bankrollBefore = yesterdaySummary?.bankrollAfter || 100
      const bankrollAfter = settings.bankroll || 100

      // Calculate season stats
      const allPicks = await this.bettingPickModel
        .find({
          status: { $in: [PickStatus.WON, PickStatus.LOST] },
        })
        .exec()

      const allCombos = await this.bettingComboModel
        .find({
          status: { $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL] },
        })
        .exec()

      const totalBets = allPicks.length + allCombos.length
      const totalStaked =
        allPicks.reduce((sum, p) => sum + (p.stake || 0), 0) +
        allCombos.reduce((sum, c) => sum + (c.stake || 0), 0)
      const totalProfit =
        allPicks.reduce((sum, p) => sum + (p.profit || 0), 0) +
        allCombos.reduce((sum, c) => sum + (c.profit || 0), 0)

      const avgCLV =
        allPicks.length > 0
          ? allPicks.reduce((sum, p) => sum + (p.clv || 0), 0) / allPicks.length
          : 0

      const roi = totalStaked > 0 ? totalProfit / totalStaked : 0

      // Calculate current streak
      const summaries = await this.dailySummaryModel
        .find()
        .sort({ date: -1 })
        .limit(10)
        .exec()

      let currentStreak = 0
      for (const summary of summaries) {
        if ((summary.totalProfit || 0) > 0) {
          currentStreak++
        } else {
          break
        }
      }

      const message = this.formatters.formatResultsAlert(
        date,
        picks,
        combos,
        bankrollBefore,
        bankrollAfter,
        {
          totalBets,
          avgCLV,
          roi,
          currentStreak,
        }
      )

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
      })

      this.logger.log('Results alert sent successfully')
    } catch (error) {
      this.logger.error(`Failed to send results alert: ${error}`)
    }
  }

  /**
   * Send result registration buttons for a pick (legacy - for manual result entry)
   */
  async sendResultButtons(pick: BettingPickDocument): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      return
    }

    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.telegramAlertsOn) {
        return
      }

      const odds = (pick.oddsAtBet || pick.oddsAtDetection || 0).toFixed(2)
      const message = `${pick.teamHome.name} vs ${pick.teamAway.name}\n${pick.market} @${odds}`

      const buttons = Markup.inlineKeyboard([
        [
          Markup.button.callback('\u2705 WIN', `bet_result:${pick._id}:won`),
          Markup.button.callback('\u274c LOSE', `bet_result:${pick._id}:lost`),
          Markup.button.callback('\ud83d\udd04 VOID', `bet_result:${pick._id}:void`),
        ],
      ])

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
        ...buttons,
      })
    } catch (error) {
      this.logger.error(`Failed to send result buttons: ${error}`)
    }
  }

  /**
   * Send pick alert with APOSTÉ button for tracking real bets
   */
  async sendPickWithBetButton(pick: BettingPickDocument): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      return
    }

    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.telegramAlertsOn) {
        return
      }

      const odds = (pick.oddsAtBet || pick.oddsAtDetection || 0).toFixed(2)
      const stake = pick.stake ? `$${pick.stake.toFixed(2)}` : ''
      const starsEmoji = '\u2b50'.repeat(pick.stars || 3)
      const reasons = pick.reasons?.length > 0 ? pick.reasons.join('\n• ') : ''

      // Format market label nicely
      const marketLabel = this.formatters.formatMarketLabel(pick.market, pick.line, pick.direction)

      // Format kickoff with date and time in user timezone (from settings)
      const userTimezone = settings.timezone || 'UTC'
      const kickoffDate = new Date(pick.kickoff)
      const dateOptions: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: userTimezone,
      }
      const formattedKickoff = kickoffDate.toLocaleString('es-SV', dateOptions)

      // Get bookmaker info - show top 3 popular bookmakers
      const popularBookmakers = ['Bet365', 'Betfair', '1xBet']
      const bookmakerEmojis: Record<string, string> = {
        'Bet365': '🅱️',
        'Betfair': '🔵',
        '1xBet': '1️⃣',
        'Pinnacle': '📌',
        'Unibet': '🟢',
        'Bwin': '🟡',
      }

      // If we have a specific best bookmaker, put it first
      let displayBookmakers = [...popularBookmakers]
      if (pick.bestBookmaker && pick.bestBookmaker !== 'API-Football') {
        const bestNormalized = pick.bestBookmaker.charAt(0).toUpperCase() + pick.bestBookmaker.slice(1).toLowerCase()
        if (!displayBookmakers.includes(bestNormalized) && !displayBookmakers.includes(pick.bestBookmaker)) {
          displayBookmakers = [pick.bestBookmaker, ...displayBookmakers.slice(0, 2)]
        }
      }

      // Format bookmakers: show 3 main ones
      const formattedBookmakers = displayBookmakers.slice(0, 3).map(b => {
        const emoji = bookmakerEmojis[b] || '📍'
        return `${emoji} ${b}`
      }).join(' • ')

      // Add "+X más" if there could be more
      const bookmakerLine = `${formattedBookmakers} +2 más`

      let message = `🚨 *NUEVO PICK*\n`
      message += '━'.repeat(20) + '\n\n'
      message += `⚽ *${pick.teamHome.name}* vs *${pick.teamAway.name}*\n`
      message += `🏆 ${pick.league.name}\n`
      message += `📊 ${marketLabel}\n`
      message += `💰 @${odds} ${stake ? `| Stake: ${stake}` : ''}\n`
      message += `${starsEmoji} Confianza: ${pick.confidenceScore}%\n`
      message += `🎯 ${bookmakerLine}\n`
      if (reasons) {
        message += `\n📝 *Razones:*\n• ${reasons}\n`
      }
      message += `\n📅 ${formattedKickoff}`

      const buttonText = pick.betPlaced ? '✅ APOSTADO' : '💰 APOSTÉ'
      const buttons = Markup.inlineKeyboard([
        [Markup.button.callback(buttonText, `bet_placed:${pick._id}`)],
      ])

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
        ...buttons,
      })

      this.logger.log(`Pick alert with bet button sent: ${pick.teamHome.name} vs ${pick.teamAway.name}`)
    } catch (error) {
      this.logger.error(`Failed to send pick with bet button: ${error}`)
    }
  }

  /**
   * Send personal result notification (when user actually bet)
   * Called by result-collector when a pick with betPlaced=true is settled
   */
  async sendPersonalResultNotification(
    pick: BettingPickDocument,
    profit: number
  ): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      return
    }

    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.telegramAlertsOn) {
        return
      }

      const isWin = profit > 0
      const emoji = isWin ? '✅' : '❌'
      const resultText = isWin ? 'GANASTE' : 'PERDISTE'
      const profitText = profit >= 0 ? `+$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`
      const stake = pick.stake || pick.betAmount || 0

      // Format market label nicely
      const marketLabel = this.formatters.formatMarketLabel(pick.market, pick.line, pick.direction)

      let message = `${emoji} *${resultText}* ${profitText}\n`
      message += '━'.repeat(22) + '\n\n'

      // Match info
      message += `⚽ *${pick.teamHome.name}* vs *${pick.teamAway.name}*\n`
      message += `🏆 ${pick.league.name}\n\n`

      // Bet details
      message += `📊 *Apuesta:* ${marketLabel}\n`
      message += `💵 *Stake:* $${stake.toFixed(2)} @ ${(pick.oddsAtDetection || 0).toFixed(2)}\n`

      // Match result
      if (pick.matchResult) {
        message += '\n📋 *Resultado del partido:*\n'
        if (pick.matchResult.scoreHT) {
          message += `   HT: ${pick.matchResult.scoreHT}\n`
        }
        if (pick.matchResult.scoreFT) {
          message += `   FT: ${pick.matchResult.scoreFT}\n`
        }
        if (pick.matchResult.cornersTotal !== undefined) {
          message += `   Corners: ${pick.matchResult.cornersTotal}\n`
        }
      }

      // Updated bankroll
      const newBankroll = settings.bankroll + profit
      message += `\n💰 *Bankroll:* $${settings.bankroll.toFixed(2)} → $${newBankroll.toFixed(2)}`

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
      })

      this.logger.log(`Personal result notification sent: ${pick.teamHome.name} vs ${pick.teamAway.name} - ${resultText} ${profitText}`)
    } catch (error) {
      this.logger.error(`Failed to send personal result notification: ${error}`)
    }
  }

  /**
   * Send result registration buttons for a combo
   */
  async sendComboResultButtons(combo: BettingComboDocument): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      return
    }

    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.telegramAlertsOn) {
        return
      }

      const odds = (combo.combinedOdds || 0).toFixed(2)
      const legsInfo = combo.legs.map((l: any) => l.market).join(' + ')
      const message = `${combo.type}\n${legsInfo}\n@${odds}`

      const buttons = Markup.inlineKeyboard([
        [
          Markup.button.callback('\u2705 WIN', `combo_result:${combo._id}:won`),
          Markup.button.callback('\u274c LOSE', `combo_result:${combo._id}:lost`),
          Markup.button.callback('\ud83d\udfe1 PARTIAL', `combo_result:${combo._id}:partial`),
        ],
      ])

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
        ...buttons,
      })
    } catch (error) {
      this.logger.error(`Failed to send combo result buttons: ${error}`)
    }
  }

  /**
   * Send a simple message to admin
   */
  async sendMessage(message: string): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      return
    }

    try {
      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
      })
    } catch (error) {
      this.logger.error(`Failed to send message: ${error}`)
    }
  }

  /**
   * Send Steam Move Alert (real-time notification)
   * Called by odds-monitor.cron.ts when a significant odds movement is detected
   */
  async sendSteamMoveAlert(
    pick: BettingPickDocument,
    direction: string,
    pctChange: number
  ): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      return
    }

    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.telegramAlertsOn) {
        return
      }

      const isFavorable = direction === 'FAVORABLE'
      const emoji = isFavorable ? '\ud83d\udfe2' : '\ud83d\udd34'
      const directionText = isFavorable ? 'FAVORABLE' : 'CONTRA'
      const actionText = isFavorable
        ? 'Confirma la señal - dinero inteligente entrando'
        : '⚠️ PRECAUCIÓN - posible info oculta (lesión, rotación)'

      let message = `${emoji} STEAM MOVE DETECTADO\n`
      message += '\u2501'.repeat(25) + '\n\n'
      message += `*${pick.teamHome.name}* vs *${pick.teamAway.name}*\n`
      message += `Liga: ${pick.league.name}\n`
      message += `Mercado: ${pick.market}\n`
      message += `Dirección: ${pick.direction} ${pick.line}\n\n`
      message += `📊 Movimiento: *${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%* (${directionText})\n`
      message += `Odds original: @${(pick.oddsAtDetection || 0).toFixed(2)}\n\n`
      message += `💡 ${actionText}\n\n`
      message += `Kickoff: ${pick.kickoff.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
      })

      this.logger.log(`Steam move alert sent: ${pick.teamHome.name} vs ${pick.teamAway.name}`)
    } catch (error) {
      this.logger.error(`Failed to send steam move alert: ${error}`)
    }
  }

  /**
   * Send anti-tilt warning when daily loss exceeds threshold
   */
  async sendAntiTiltWarning(
    dailyLoss: number,
    lossPercentage: number,
    bankroll: number
  ): Promise<void> {
    const adminChatId = this.guard.getAdminChatId()
    if (!adminChatId || !this.bot) {
      return
    }

    try {
      let message = `\u26a0\ufe0f ANTI-TILT ACTIVADO\n`
      message += '\u2501'.repeat(20) + '\n\n'
      message += `Perdida del dia: $${Math.abs(dailyLoss).toFixed(2)} (${lossPercentage.toFixed(1)}%)\n`
      message += `Bankroll actual: $${bankroll.toFixed(2)}\n\n`
      message += `\ud83d\uded1 Betting PAUSADO automaticamente\n`
      message += `Usa /resume cuando estes listo para continuar`

      await this.bot.telegram.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
      })

      // Also pause betting
      await this.bettingSettingsModel.updateOne({}, { $set: { isActive: false } })

      this.logger.log('Anti-tilt warning sent and betting paused')
    } catch (error) {
      this.logger.error(`Failed to send anti-tilt warning: ${error}`)
    }
  }

  /**
   * Get the bot instance (for testing or external use)
   */
  getBot(): Telegraf | null {
    return this.bot
  }
}
