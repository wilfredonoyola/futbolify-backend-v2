import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
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
import {
  BettingLeague,
  BettingLeagueDocument,
} from '../schemas/betting-league.schema'
import { PickStatus, ComboStatus } from '../enums/betting.enums'
import { BettingTelegramGuard } from './betting-telegram.guards'
import { BettingTelegramFormatters } from './betting-telegram.formatters'

/**
 * Command handlers for betting Telegram commands
 * All commands are admin-only
 */
@Injectable()
export class BettingTelegramCommands {
  private readonly logger = new Logger(BettingTelegramCommands.name)

  constructor(
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingDailySummary.name)
    private dailySummaryModel: Model<BettingDailySummaryDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    private guard: BettingTelegramGuard,
    private formatters: BettingTelegramFormatters
  ) {}

  /**
   * /picks - View today's picks (quick summary)
   */
  async handlePicks(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const picks = await this.bettingPickModel
        .find({
          date: { $gte: today, $lt: tomorrow },
        })
        .sort({ kickoff: 1 })
        .exec()

      const message = this.formatters.formatPicksSummary(picks)
      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /picks command: ${error}`)
      await ctx.reply('Error al obtener picks')
    }
  }

  /**
   * /picks_full - View picks with full detail
   */
  async handlePicksFull(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const picks = await this.bettingPickModel
        .find({
          date: { $gte: today, $lt: tomorrow },
        })
        .sort({ kickoff: 1 })
        .exec()

      if (picks.length === 0) {
        await ctx.reply('No hay picks para hoy')
        return
      }

      // Send detailed info for each pick
      for (const pick of picks) {
        const prob = (pick.probOwn * 100).toFixed(1)
        const edge = (pick.edge * 100).toFixed(1)
        const odds = (pick.oddsAtDetection || 0).toFixed(2)

        let message = `\ud83c\udfaf *${pick.teamHome.name} vs ${pick.teamAway.name}*\n`
        message += `${pick.league.name} - ${pick.league.country}\n\n`
        message += `Mercado: ${pick.market}\n`
        message += `Prob: ${prob}% | Cuota: @${odds}\n`
        message += `Edge: ${edge}% | Score: ${pick.confidenceScore}/100\n`
        message += `Stake: $${(pick.stake || 0).toFixed(2)}\n\n`

        if (pick.modelInputs?.contextFlags?.length) {
          message += `Flags: ${pick.modelInputs.contextFlags.join(', ')}\n`
        }

        await ctx.reply(message, { parse_mode: 'Markdown' })
      }
    } catch (error) {
      this.logger.error(`Error in /picks_full command: ${error}`)
      await ctx.reply('Error al obtener picks')
    }
  }

  /**
   * /combos - View today's combos
   */
  async handleCombos(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const combos = await this.bettingComboModel
        .find({
          createdAt: { $gte: today, $lt: tomorrow },
        })
        .sort({ score: -1 })
        .exec()

      const message = this.formatters.formatCombosSummary(combos)
      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /combos command: ${error}`)
      await ctx.reply('Error al obtener combinadas')
    }
  }

  /**
   * /bankroll - View current bankroll status
   */
  async handleBankroll(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const settings = await this.bettingSettingsModel.findOne().exec()
      const bankroll = settings?.bankroll || 100

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const activePicks = await this.bettingPickModel.countDocuments({
        date: { $gte: today, $lt: tomorrow },
        status: { $in: [PickStatus.PENDING, PickStatus.ACTIVE] },
      })

      const activeCombos = await this.bettingComboModel.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow },
        status: ComboStatus.PENDING,
      })

      // Calculate daily exposure
      const picks = await this.bettingPickModel.find({
        date: { $gte: today, $lt: tomorrow },
        status: { $in: [PickStatus.PENDING, PickStatus.ACTIVE] },
      })
      const combos = await this.bettingComboModel.find({
        createdAt: { $gte: today, $lt: tomorrow },
        status: ComboStatus.PENDING,
      })

      const dailyExposure =
        picks.reduce((sum, p) => sum + (p.stake || 0), 0) +
        combos.reduce((sum, c) => sum + (c.stake || 0), 0)

      const message = this.formatters.formatBankrollStatus(
        bankroll,
        dailyExposure,
        activePicks,
        activeCombos
      )
      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /bankroll command: ${error}`)
      await ctx.reply('Error al obtener bankroll')
    }
  }

  /**
   * /stats - View cumulative stats
   */
  async handleStats(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const picks = await this.bettingPickModel
        .find({
          status: { $in: [PickStatus.WON, PickStatus.LOST] },
        })
        .exec()

      const combos = await this.bettingComboModel
        .find({
          status: { $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL] },
        })
        .exec()

      const picksWon = picks.filter((p) => p.status === PickStatus.WON).length
      const combosWon = combos.filter((c) => c.status === ComboStatus.WON).length

      const totalBets = picks.length + combos.length
      const totalWins = picksWon + combosWon
      const winRate = totalBets > 0 ? totalWins / totalBets : 0

      const profit =
        picks.reduce((sum, p) => sum + (p.profit || 0), 0) +
        combos.reduce((sum, c) => sum + (c.profit || 0), 0)

      const totalStaked =
        picks.reduce((sum, p) => sum + (p.stake || 0), 0) +
        combos.reduce((sum, c) => sum + (c.stake || 0), 0)

      const roi = totalStaked > 0 ? profit / totalStaked : 0

      const avgCLV =
        picks.length > 0
          ? picks.reduce((sum, p) => sum + (p.clv || 0), 0) / picks.length
          : 0

      const message = this.formatters.formatStatsSummary({
        totalBets,
        avgCLV,
        roi,
        winRate,
        profit,
        picksCount: picks.length,
        combosCount: combos.length,
      })

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /stats command: ${error}`)
      await ctx.reply('Error al obtener estadisticas')
    }
  }

  /**
   * /stats_goals - Stats for goals 1H module only
   */
  async handleStatsGoals(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const picks = await this.bettingPickModel
        .find({
          status: { $in: [PickStatus.WON, PickStatus.LOST] },
          market: { $regex: /goal|1h/i },
        })
        .exec()

      const won = picks.filter((p) => p.status === PickStatus.WON).length
      const lost = picks.filter((p) => p.status === PickStatus.LOST).length
      const winRate = picks.length > 0 ? (won / picks.length) * 100 : 0
      const profit = picks.reduce((sum, p) => sum + (p.profit || 0), 0)
      const avgCLV =
        picks.length > 0
          ? (picks.reduce((sum, p) => sum + (p.clv || 0), 0) / picks.length) * 100
          : 0

      let message = `\u26bd STATS GOLES 1H\n`
      message += '\u2501'.repeat(20) + '\n\n'
      message += `Total: ${picks.length} picks\n`
      message += `Record: ${won}W ${lost}L\n`
      message += `Win rate: ${winRate.toFixed(1)}%\n`
      message += `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}\n`
      message += `CLV promedio: ${avgCLV >= 0 ? '+' : ''}${avgCLV.toFixed(1)}%`

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /stats_goals command: ${error}`)
      await ctx.reply('Error al obtener estadisticas')
    }
  }

  /**
   * /stats_corners - Stats for corners module only
   */
  async handleStatsCorners(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const picks = await this.bettingPickModel
        .find({
          status: { $in: [PickStatus.WON, PickStatus.LOST] },
          market: { $regex: /corner/i },
        })
        .exec()

      const won = picks.filter((p) => p.status === PickStatus.WON).length
      const lost = picks.filter((p) => p.status === PickStatus.LOST).length
      const winRate = picks.length > 0 ? (won / picks.length) * 100 : 0
      const profit = picks.reduce((sum, p) => sum + (p.profit || 0), 0)
      const avgCLV =
        picks.length > 0
          ? (picks.reduce((sum, p) => sum + (p.clv || 0), 0) / picks.length) * 100
          : 0

      let message = `\ud83d\udea9 STATS CORNERS\n`
      message += '\u2501'.repeat(20) + '\n\n'
      message += `Total: ${picks.length} picks\n`
      message += `Record: ${won}W ${lost}L\n`
      message += `Win rate: ${winRate.toFixed(1)}%\n`
      message += `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}\n`
      message += `CLV promedio: ${avgCLV >= 0 ? '+' : ''}${avgCLV.toFixed(1)}%`

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /stats_corners command: ${error}`)
      await ctx.reply('Error al obtener estadisticas')
    }
  }

  /**
   * /stats_combos - Stats for combos only
   */
  async handleStatsCombos(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const combos = await this.bettingComboModel
        .find({
          status: { $in: [ComboStatus.WON, ComboStatus.LOST, ComboStatus.PARTIAL] },
        })
        .exec()

      const won = combos.filter((c) => c.status === ComboStatus.WON).length
      const lost = combos.filter((c) => c.status === ComboStatus.LOST).length
      const partial = combos.filter((c) => c.status === ComboStatus.PARTIAL).length
      const winRate = combos.length > 0 ? (won / combos.length) * 100 : 0
      const profit = combos.reduce((sum, c) => sum + (c.profit || 0), 0)

      // Group by type
      const byType = new Map<string, { count: number; won: number; profit: number }>()
      for (const combo of combos) {
        const type = combo.type
        const existing = byType.get(type) || { count: 0, won: 0, profit: 0 }
        existing.count++
        if (combo.status === ComboStatus.WON) existing.won++
        existing.profit += combo.profit || 0
        byType.set(type, existing)
      }

      let message = `\ud83d\udd17 STATS COMBINADAS\n`
      message += '\u2501'.repeat(20) + '\n\n'
      message += `Total: ${combos.length} combos\n`
      message += `Record: ${won}W ${lost}L ${partial}P\n`
      message += `Win rate: ${winRate.toFixed(1)}%\n`
      message += `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}\n\n`
      message += `Por tipo:\n`

      for (const [type, stats] of byType) {
        const typeWinRate = stats.count > 0 ? (stats.won / stats.count) * 100 : 0
        message += `  ${type}: ${stats.count} (${typeWinRate.toFixed(0)}% win)\n`
      }

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /stats_combos command: ${error}`)
      await ctx.reply('Error al obtener estadisticas')
    }
  }

  /**
   * /streak - Current and max streaks
   */
  async handleStreak(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const summaries = await this.dailySummaryModel
        .find()
        .sort({ date: -1 })
        .limit(30)
        .exec()

      let currentStreak = 0
      let maxWinStreak = 0
      let maxLossStreak = 0
      let currentWin = 0
      let currentLoss = 0

      for (const summary of summaries) {
        const dayProfit = summary.totalProfit || 0

        if (dayProfit > 0) {
          currentWin++
          currentLoss = 0
          maxWinStreak = Math.max(maxWinStreak, currentWin)
        } else if (dayProfit < 0) {
          currentLoss++
          currentWin = 0
          maxLossStreak = Math.max(maxLossStreak, currentLoss)
        }
      }

      if (summaries.length > 0) {
        currentStreak = (summaries[0].totalProfit || 0) > 0 ? currentWin : -currentLoss
      }

      let message = `\ud83d\udcc8 RACHAS\n`
      message += '\u2501'.repeat(15) + '\n\n'
      message += `Racha actual: ${currentStreak >= 0 ? currentStreak + 'W' : Math.abs(currentStreak) + 'L'}\n`
      message += `Max racha ganadora: ${maxWinStreak}W\n`
      message += `Max racha perdedora: ${maxLossStreak}L`

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /streak command: ${error}`)
      await ctx.reply('Error al obtener rachas')
    }
  }

  /**
   * /set_bankroll {amount} - Update bankroll manually
   */
  async handleSetBankroll(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const args = ctx.message.text.split(' ')
      if (args.length < 2) {
        await ctx.reply('Uso: /set_bankroll {cantidad}\nEjemplo: /set_bankroll 150')
        return
      }

      const amount = parseFloat(args[1])
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('Cantidad invalida. Debe ser un numero positivo.')
        return
      }

      await this.bettingSettingsModel.updateOne({}, { $set: { bankroll: amount } })

      await ctx.reply(`\u2705 Bankroll actualizado a $${amount.toFixed(2)}`)
      this.logger.log(`Bankroll updated to $${amount} via Telegram`)
    } catch (error) {
      this.logger.error(`Error in /set_bankroll command: ${error}`)
      await ctx.reply('Error al actualizar bankroll')
    }
  }

  /**
   * /pause - Pause betting alerts
   */
  async handlePause(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      await this.bettingSettingsModel.updateOne(
        {},
        { $set: { isActive: false, telegramAlertsOn: false } }
      )

      await ctx.reply('\u23f8 Betting PAUSADO. Usa /resume para reanudar.')
      this.logger.log('Betting paused via Telegram')
    } catch (error) {
      this.logger.error(`Error in /pause command: ${error}`)
      await ctx.reply('Error al pausar')
    }
  }

  /**
   * /resume - Resume betting alerts
   */
  async handleResume(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      await this.bettingSettingsModel.updateOne(
        {},
        { $set: { isActive: true, telegramAlertsOn: true } }
      )

      await ctx.reply('\u25b6 Betting REANUDADO. Alertas activadas.')
      this.logger.log('Betting resumed via Telegram')
    } catch (error) {
      this.logger.error(`Error in /resume command: ${error}`)
      await ctx.reply('Error al reanudar')
    }
  }

  /**
   * /leagues - View active leagues and tiers
   */
  async handleLeagues(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const leagues = await this.bettingLeagueModel
        .find({ isActive: true })
        .sort({ tier: 1, name: 1 })
        .exec()

      if (leagues.length === 0) {
        await ctx.reply('No hay ligas activas')
        return
      }

      let message = `\ud83c\udfc6 LIGAS ACTIVAS (${leagues.length})\n`
      message += '\u2501'.repeat(20) + '\n\n'

      let currentTier = 0
      for (const league of leagues) {
        if (league.tier !== currentTier) {
          currentTier = league.tier
          message += `\n*Tier ${currentTier}*\n`
        }
        message += `  \u2022 ${league.name} (${league.country})\n`
      }

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /leagues command: ${error}`)
      await ctx.reply('Error al obtener ligas')
    }
  }

  /**
   * /history {n} - Last N bets with results
   */
  async handleHistory(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const args = ctx.message.text.split(' ')
      const limit = args.length > 1 ? parseInt(args[1], 10) : 10

      if (isNaN(limit) || limit < 1 || limit > 50) {
        await ctx.reply('Uso: /history {n}\nN debe estar entre 1 y 50')
        return
      }

      const picks = await this.bettingPickModel
        .find({
          status: { $in: [PickStatus.WON, PickStatus.LOST, PickStatus.VOID] },
        })
        .sort({ date: -1, kickoff: -1 })
        .limit(limit)
        .exec()

      if (picks.length === 0) {
        await ctx.reply('No hay historial')
        return
      }

      let message = `\ud83d\udcdc ULTIMAS ${picks.length} APUESTAS\n`
      message += '\u2501'.repeat(22) + '\n\n'

      for (const pick of picks) {
        const statusIcon =
          pick.status === PickStatus.WON
            ? '\u2705'
            : pick.status === PickStatus.LOST
              ? '\u274c'
              : '\ud83d\udd04'

        const dateStr = pick.date.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
        })
        const profit = pick.profit || 0

        message += `${statusIcon} ${dateStr} | ${pick.teamHome.name} vs ${pick.teamAway.name}\n`
        message += `   ${pick.market} @${(pick.oddsAtBet || pick.oddsAtDetection || 0).toFixed(2)}`
        message += ` | ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}\n`
      }

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /history command: ${error}`)
      await ctx.reply('Error al obtener historial')
    }
  }

  /**
   * /best - Top 5 most profitable bets
   */
  async handleBest(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const picks = await this.bettingPickModel
        .find({
          status: PickStatus.WON,
          profit: { $gt: 0 },
        })
        .sort({ profit: -1 })
        .limit(5)
        .exec()

      if (picks.length === 0) {
        await ctx.reply('No hay picks ganadores aun')
        return
      }

      let message = `\ud83c\udfc6 TOP 5 MEJORES\n`
      message += '\u2501'.repeat(18) + '\n\n'

      picks.forEach((pick, index) => {
        const dateStr = pick.date.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
        })
        message += `${index + 1}. ${pick.teamHome.name} vs ${pick.teamAway.name}\n`
        message += `   ${dateStr} | +$${(pick.profit || 0).toFixed(2)}\n`
      })

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /best command: ${error}`)
      await ctx.reply('Error al obtener mejores')
    }
  }

  /**
   * /worst - Top 5 worst bets
   */
  async handleWorst(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const picks = await this.bettingPickModel
        .find({
          status: PickStatus.LOST,
          profit: { $lt: 0 },
        })
        .sort({ profit: 1 })
        .limit(5)
        .exec()

      if (picks.length === 0) {
        await ctx.reply('No hay picks perdedores aun')
        return
      }

      let message = `\ud83d\udcc9 TOP 5 PEORES\n`
      message += '\u2501'.repeat(17) + '\n\n'

      picks.forEach((pick, index) => {
        const dateStr = pick.date.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
        })
        message += `${index + 1}. ${pick.teamHome.name} vs ${pick.teamAway.name}\n`
        message += `   ${dateStr} | $${(pick.profit || 0).toFixed(2)}\n`
      })

      await ctx.reply(message, { parse_mode: 'Markdown' })
    } catch (error) {
      this.logger.error(`Error in /worst command: ${error}`)
      await ctx.reply('Error al obtener peores')
    }
  }

  /**
   * /result {fixture_id} {W/L/V} - Register pick result manually
   */
  async handleResult(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const args = ctx.message.text.split(' ')
      if (args.length < 3) {
        await ctx.reply('Uso: /result {fixture_id} {W/L/V}\nEjemplo: /result 12345 W')
        return
      }

      const fixtureId = parseInt(args[1], 10)
      const result = args[2].toUpperCase()

      if (isNaN(fixtureId)) {
        await ctx.reply('Fixture ID invalido')
        return
      }

      const statusMap: Record<string, PickStatus> = {
        W: PickStatus.WON,
        L: PickStatus.LOST,
        V: PickStatus.VOID,
      }

      const newStatus = statusMap[result]
      if (!newStatus) {
        await ctx.reply('Resultado invalido. Usa W (won), L (lost), o V (void)')
        return
      }

      const pick = await this.bettingPickModel.findOne({ fixtureId }).exec()
      if (!pick) {
        await ctx.reply(`Pick con fixture ${fixtureId} no encontrado`)
        return
      }

      // Calculate profit
      const stake = pick.stake || 0
      const odds = pick.oddsAtBet || pick.oddsAtDetection || 0
      let profit = 0

      if (newStatus === PickStatus.WON) {
        profit = stake * (odds - 1)
      } else if (newStatus === PickStatus.LOST) {
        profit = -stake
      }

      await this.bettingPickModel.updateOne(
        { _id: pick._id },
        { $set: { status: newStatus, profit } }
      )

      // Update bankroll
      if (profit !== 0) {
        await this.bettingSettingsModel.updateOne({}, { $inc: { bankroll: profit } })
      }

      const statusEmoji =
        newStatus === PickStatus.WON
          ? '\u2705 WIN'
          : newStatus === PickStatus.LOST
            ? '\u274c LOSE'
            : '\ud83d\udd04 VOID'

      await ctx.reply(
        `${statusEmoji} registrado para ${pick.teamHome.name} vs ${pick.teamAway.name}\n` +
          `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`
      )

      this.logger.log(`Pick ${pick._id} result registered: ${newStatus}`)
    } catch (error) {
      this.logger.error(`Error in /result command: ${error}`)
      await ctx.reply('Error al registrar resultado')
    }
  }

  /**
   * /result_combo {combo_id} {W/L/P} - Register combo result manually
   */
  async handleResultCombo(ctx: any): Promise<void> {
    if (!this.guard.checkAuth(ctx)) {
      await ctx.reply('No autorizado para comandos de betting')
      return
    }

    try {
      const args = ctx.message.text.split(' ')
      if (args.length < 3) {
        await ctx.reply(
          'Uso: /result_combo {combo_id} {W/L/P}\nEjemplo: /result_combo 60a1b2c3 W'
        )
        return
      }

      const comboId = args[1]
      const result = args[2].toUpperCase()

      const statusMap: Record<string, ComboStatus> = {
        W: ComboStatus.WON,
        L: ComboStatus.LOST,
        P: ComboStatus.PARTIAL,
      }

      const newStatus = statusMap[result]
      if (!newStatus) {
        await ctx.reply('Resultado invalido. Usa W (won), L (lost), o P (partial)')
        return
      }

      const combo = await this.bettingComboModel.findById(comboId).exec()
      if (!combo) {
        await ctx.reply(`Combo ${comboId} no encontrado`)
        return
      }

      // Calculate profit
      const stake = combo.stake || 0
      const odds = combo.combinedOdds || 0
      let profit = 0

      if (newStatus === ComboStatus.WON) {
        profit = stake * (odds - 1)
      } else if (newStatus === ComboStatus.LOST) {
        profit = -stake
      } else if (newStatus === ComboStatus.PARTIAL) {
        profit = -stake * 0.5
      }

      await this.bettingComboModel.updateOne(
        { _id: combo._id },
        { $set: { status: newStatus, profit } }
      )

      // Update bankroll
      if (profit !== 0) {
        await this.bettingSettingsModel.updateOne({}, { $inc: { bankroll: profit } })
      }

      const statusEmoji =
        newStatus === ComboStatus.WON
          ? '\u2705 WIN'
          : newStatus === ComboStatus.LOST
            ? '\u274c LOSE'
            : '\ud83d\udfe1 PARTIAL'

      await ctx.reply(
        `${statusEmoji} registrado para combo ${combo.type}\n` +
          `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`
      )

      this.logger.log(`Combo ${combo._id} result registered: ${newStatus}`)
    } catch (error) {
      this.logger.error(`Error in /result_combo command: ${error}`)
      await ctx.reply('Error al registrar resultado')
    }
  }
}
