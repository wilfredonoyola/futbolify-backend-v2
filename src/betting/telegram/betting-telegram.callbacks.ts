import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import { BettingCombo, BettingComboDocument } from '../schemas/betting-combo.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import { PickStatus, ComboStatus } from '../enums/betting.enums'
import { BettingTelegramGuard } from './betting-telegram.guards'
import { BettingTelegramFormatters } from './betting-telegram.formatters'

/**
 * Callback data format:
 * bet_result:{pickId}:{result} - For pick results (won/lost/void)
 * combo_result:{comboId}:{result} - For combo results (won/lost/partial)
 * bet_confirm:{pickId} - Confirm a pending pick as active
 * bet_cancel:{pickId} - Cancel a pending pick
 * bet_placed:{pickId} - Toggle betPlaced status (user marked they bet)
 */
@Injectable()
export class BettingTelegramCallbacks {
  private readonly logger = new Logger(BettingTelegramCallbacks.name)

  constructor(
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingCombo.name)
    private bettingComboModel: Model<BettingComboDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    private guard: BettingTelegramGuard,
    private formatters: BettingTelegramFormatters
  ) {}

  /**
   * Parse callback data
   */
  parseCallback(data: string): {
    type: 'bet_result' | 'combo_result' | 'bet_confirm' | 'bet_cancel' | 'bet_placed' | 'unknown'
    id: string
    value?: string
  } {
    const parts = data.split(':')

    if (parts[0] === 'bet_result' && parts.length === 3) {
      return { type: 'bet_result', id: parts[1], value: parts[2] }
    }
    if (parts[0] === 'combo_result' && parts.length === 3) {
      return { type: 'combo_result', id: parts[1], value: parts[2] }
    }
    if (parts[0] === 'bet_confirm' && parts.length === 2) {
      return { type: 'bet_confirm', id: parts[1] }
    }
    if (parts[0] === 'bet_cancel' && parts.length === 2) {
      return { type: 'bet_cancel', id: parts[1] }
    }
    if (parts[0] === 'bet_placed' && parts.length === 2) {
      return { type: 'bet_placed', id: parts[1] }
    }

    return { type: 'unknown', id: '' }
  }

  /**
   * Handle callback query from Telegram
   */
  async handleCallback(ctx: any): Promise<string> {
    // Check auth
    if (!this.guard.checkAuth(ctx)) {
      return 'No autorizado'
    }

    const data = ctx.callbackQuery?.data
    if (!data || typeof data !== 'string') {
      return 'Datos invalidos'
    }

    // Only handle betting-related callbacks
    if (!data.startsWith('bet_') && !data.startsWith('combo_')) {
      return '' // Not a betting callback, let other handlers process
    }

    const parsed = this.parseCallback(data)

    switch (parsed.type) {
      case 'bet_result':
        return this.handlePickResult(parsed.id, parsed.value as string, ctx)
      case 'combo_result':
        return this.handleComboResult(parsed.id, parsed.value as string, ctx)
      case 'bet_confirm':
        return this.handlePickConfirm(parsed.id, ctx)
      case 'bet_cancel':
        return this.handlePickCancel(parsed.id, ctx)
      case 'bet_placed':
        return this.handleBetPlacedToggle(parsed.id, ctx)
      default:
        return 'Accion no reconocida'
    }
  }

  /**
   * Handle pick result registration (WIN/LOSE/VOID)
   */
  private async handlePickResult(
    pickId: string,
    result: string,
    ctx: any
  ): Promise<string> {
    try {
      const pick = await this.bettingPickModel.findById(pickId).exec()
      if (!pick) {
        return 'Pick no encontrado'
      }

      // Map result to status
      const statusMap: Record<string, PickStatus> = {
        won: PickStatus.WON,
        lost: PickStatus.LOST,
        void: PickStatus.VOID,
      }

      const newStatus = statusMap[result.toLowerCase()]
      if (!newStatus) {
        return 'Resultado invalido'
      }

      // Calculate profit based on result
      const stake = pick.stake || 0
      const odds = pick.oddsAtBet || pick.oddsAtDetection || 0
      let profit = 0

      if (newStatus === PickStatus.WON) {
        profit = stake * (odds - 1)
      } else if (newStatus === PickStatus.LOST) {
        profit = -stake
      }
      // VOID = 0 profit (stake returned)

      // Update pick
      await this.bettingPickModel.updateOne(
        { _id: pickId },
        {
          $set: {
            status: newStatus,
            profit,
          },
        }
      )

      // Update bankroll
      if (profit !== 0) {
        await this.updateBankroll(profit)
      }

      // Update message to show result was registered
      const statusEmoji =
        newStatus === PickStatus.WON
          ? '\u2705 WIN'
          : newStatus === PickStatus.LOST
            ? '\u274c LOSE'
            : '\ud83d\udd04 VOID'

      try {
        await ctx.editMessageText(
          `${pick.teamHome.name} vs ${pick.teamAway.name}\n` +
            `Resultado registrado: ${statusEmoji}\n` +
            `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`
        )
      } catch {
        // Message might already be edited
      }

      this.logger.log(
        `Pick ${pickId} marked as ${newStatus}, profit: $${profit.toFixed(2)}`
      )

      return `Registrado: ${statusEmoji}`
    } catch (error) {
      this.logger.error(`Error handling pick result: ${error}`)
      return 'Error al registrar resultado'
    }
  }

  /**
   * Handle combo result registration
   */
  private async handleComboResult(
    comboId: string,
    result: string,
    ctx: any
  ): Promise<string> {
    try {
      const combo = await this.bettingComboModel.findById(comboId).exec()
      if (!combo) {
        return 'Combo no encontrado'
      }

      // Map result to status
      const statusMap: Record<string, ComboStatus> = {
        won: ComboStatus.WON,
        lost: ComboStatus.LOST,
        partial: ComboStatus.PARTIAL,
      }

      const newStatus = statusMap[result.toLowerCase()]
      if (!newStatus) {
        return 'Resultado invalido'
      }

      // Calculate profit based on result
      const stake = combo.stake || 0
      const odds = combo.combinedOdds || 0
      let profit = 0

      if (newStatus === ComboStatus.WON) {
        profit = stake * (odds - 1)
      } else if (newStatus === ComboStatus.LOST) {
        profit = -stake
      } else if (newStatus === ComboStatus.PARTIAL) {
        // Partial win - need to recalculate with voided legs
        // For simplicity, assume half stake returned
        profit = -stake * 0.5
      }

      // Update combo
      await this.bettingComboModel.updateOne(
        { _id: comboId },
        {
          $set: {
            status: newStatus,
            profit,
          },
        }
      )

      // Update bankroll
      if (profit !== 0) {
        await this.updateBankroll(profit)
      }

      const statusEmoji =
        newStatus === ComboStatus.WON
          ? '\u2705 WIN'
          : newStatus === ComboStatus.LOST
            ? '\u274c LOSE'
            : '\ud83d\udfe1 PARTIAL'

      try {
        await ctx.editMessageText(
          `Combo ${combo.type}\n` +
            `Resultado registrado: ${statusEmoji}\n` +
            `Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`
        )
      } catch {
        // Message might already be edited
      }

      this.logger.log(
        `Combo ${comboId} marked as ${newStatus}, profit: $${profit.toFixed(2)}`
      )

      return `Registrado: ${statusEmoji}`
    } catch (error) {
      this.logger.error(`Error handling combo result: ${error}`)
      return 'Error al registrar resultado'
    }
  }

  /**
   * Handle pick confirmation (pending -> active)
   */
  private async handlePickConfirm(pickId: string, ctx: any): Promise<string> {
    try {
      const pick = await this.bettingPickModel.findById(pickId).exec()
      if (!pick) {
        return 'Pick no encontrado'
      }

      if (pick.status !== PickStatus.PENDING) {
        return 'Pick ya fue procesado'
      }

      await this.bettingPickModel.updateOne(
        { _id: pickId },
        { $set: { status: PickStatus.ACTIVE } }
      )

      try {
        const settings = await this.bettingSettingsModel.findOne().exec()
        const unitValue = settings?.stakes?.fixedStake || 10
        const stakeFormatted = this.formatters.formatStake(pick.stake || 0, unitValue)
        await ctx.editMessageText(
          `\u2705 ${pick.teamHome.name} vs ${pick.teamAway.name}\n` +
            `Pick ACTIVADO - Stake: ${stakeFormatted}`
        )
      } catch {
        // Message might already be edited
      }

      this.logger.log(`Pick ${pickId} activated`)
      return 'Pick activado'
    } catch (error) {
      this.logger.error(`Error confirming pick: ${error}`)
      return 'Error al activar pick'
    }
  }

  /**
   * Handle pick cancellation
   */
  private async handlePickCancel(pickId: string, ctx: any): Promise<string> {
    try {
      const pick = await this.bettingPickModel.findById(pickId).exec()
      if (!pick) {
        return 'Pick no encontrado'
      }

      if (pick.status !== PickStatus.PENDING) {
        return 'Pick ya fue procesado'
      }

      await this.bettingPickModel.updateOne(
        { _id: pickId },
        { $set: { status: PickStatus.CANCELLED } }
      )

      try {
        await ctx.editMessageText(
          `\u26d4 ${pick.teamHome.name} vs ${pick.teamAway.name}\n` + `Pick CANCELADO`
        )
      } catch {
        // Message might already be edited
      }

      this.logger.log(`Pick ${pickId} cancelled`)
      return 'Pick cancelado'
    } catch (error) {
      this.logger.error(`Error cancelling pick: ${error}`)
      return 'Error al cancelar pick'
    }
  }

  /**
   * Handle bet placed toggle (user marks they placed a bet)
   */
  private async handleBetPlacedToggle(pickId: string, ctx: any): Promise<string> {
    try {
      const pick = await this.bettingPickModel.findById(pickId).exec()
      if (!pick) {
        return 'Pick no encontrado'
      }

      // Toggle the betPlaced status
      const newBetPlaced = !pick.betPlaced
      const updateData: Record<string, unknown> = {
        betPlaced: newBetPlaced,
      }

      if (newBetPlaced) {
        updateData.betPlacedAt = new Date()
        updateData.betAmount = pick.stake || 0
      } else {
        updateData.betPlacedAt = null
        updateData.betAmount = null
      }

      await this.bettingPickModel.updateOne(
        { _id: pickId },
        { $set: updateData }
      )

      // Update button text to show current state
      const settings = await this.bettingSettingsModel.findOne().exec()
      const unitValue = settings?.stakes?.fixedStake || 10
      const odds = (pick.oddsAtBet || pick.oddsAtDetection || 0).toFixed(2)
      const stake = pick.stake ? this.formatters.formatStake(pick.stake, unitValue) : ''
      const buttonText = newBetPlaced ? '\u2705 APOSTADO' : '\ud83d\udcb0 APOSTE'

      try {
        const { Markup } = await import('telegraf')
        await ctx.editMessageText(
          `\u26bd ${pick.teamHome.name} vs ${pick.teamAway.name}\n` +
            `\ud83c\udfc6 ${pick.league.name}\n` +
            `\ud83d\udcca ${pick.market} ${pick.direction} ${pick.line}\n` +
            `\ud83d\udcb0 @${odds} ${stake}\n` +
            `${newBetPlaced ? '\u2705 Marcado como APOSTADO' : '\u23f3 No apostado'}`,
          {
            ...Markup.inlineKeyboard([
              [Markup.button.callback(buttonText, `bet_placed:${pickId}`)],
            ]),
          }
        )
      } catch {
        // Message might already be edited
      }

      this.logger.log(
        `Pick ${pickId} betPlaced toggled to ${newBetPlaced}`
      )

      return newBetPlaced ? '\u2705 Marcado como apostado' : '\u23f3 Desmarcado'
    } catch (error) {
      this.logger.error(`Error toggling betPlaced: ${error}`)
      return 'Error al cambiar estado'
    }
  }

  /**
   * Update bankroll with profit/loss
   */
  private async updateBankroll(amount: number): Promise<void> {
    try {
      await this.bettingSettingsModel.updateOne(
        {},
        { $inc: { bankroll: amount } }
      )
    } catch (error) {
      this.logger.error(`Error updating bankroll: ${error}`)
    }
  }
}
