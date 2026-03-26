import { Injectable } from '@nestjs/common'
import { BettingPickDocument } from '../schemas/betting-pick.schema'
import { BettingComboDocument } from '../schemas/betting-combo.schema'
import { PickStatus, ComboStatus, MarketType, MarketDirection, TimeWindow } from '../enums/betting.enums'

/**
 * Format stake as units with dollar amount (e.g., "2u ($20)" or "0.5u ($5)")
 * Units are shown in 0.25 increments for cleaner display
 * @param stakeDollars - The stake in dollars
 * @param unitValue - Value of 1 unit in dollars (default: $10)
 */
function formatStakeUnits(stakeDollars: number, unitValue: number = 10): string {
  const units = stakeDollars / unitValue
  // Round to nearest 0.25 for clean display
  const roundedUnits = Math.round(units * 4) / 4

  // Format units: whole number if integer, otherwise show decimals
  let unitsStr: string
  if (roundedUnits === Math.floor(roundedUnits)) {
    unitsStr = `${Math.floor(roundedUnits)}u`
  } else if (roundedUnits * 2 === Math.floor(roundedUnits * 2)) {
    // .5 increments - show 1 decimal
    unitsStr = `${roundedUnits.toFixed(1)}u`
  } else {
    // .25 or .75 - show 2 decimals
    unitsStr = `${roundedUnits.toFixed(2)}u`
  }

  // Calculate actual dollar amount based on rounded units
  const actualDollars = roundedUnits * unitValue
  return `${unitsStr} ($${actualDollars.toFixed(0)})`
}

/**
 * Format confidence score with visual bar
 */
function formatConfidenceBar(score: number): string {
  const filled = Math.round(score / 10)
  const empty = 10 - filled
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty)
}

/**
 * Format date for display (Spanish format)
 * Uses UTC to avoid timezone issues when date was created from ISO string
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).toUpperCase()
}

/**
 * Format time for display (24h format)
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Format market name for display
 */
function formatMarket(market: MarketType, pick?: any): string {
  // Special handling for corners handicap - show line and team direction
  if (market === MarketType.CORNERS_HANDICAP && pick) {
    const line = pick.line || 0
    const direction = pick.direction
    const lineStr = line >= 0 ? `+${line}` : `${line}`
    // OVER = Home covers, UNDER = Away covers
    const teamSide = direction === MarketDirection.OVER ? 'Local' : 'Visitante'
    return `Corners Hcap ${teamSide} (${lineStr})`
  }

  const marketNames: Record<MarketType, string> = {
    [MarketType.OVER_05_1H]: 'Over 0.5 Goles 1H',
    [MarketType.OVER_15_1H]: 'Over 1.5 Goles 1H',
    [MarketType.OVER_75_CORNERS]: 'Over 7.5 Corners',
    [MarketType.OVER_85_CORNERS]: 'Over 8.5 Corners',
    [MarketType.OVER_95_CORNERS]: 'Over 9.5 Corners',
    [MarketType.OVER_105_CORNERS]: 'Over 10.5 Corners',
    [MarketType.OVER_115_CORNERS]: 'Over 11.5 Corners',
    [MarketType.OVER_125_CORNERS]: 'Over 12.5 Corners',
    [MarketType.OVER_45_CORNERS_1H]: 'Over 4.5 Corners 1H',
    [MarketType.UNDER_75_CORNERS]: 'Under 7.5 Corners',
    [MarketType.UNDER_85_CORNERS]: 'Under 8.5 Corners',
    [MarketType.UNDER_95_CORNERS]: 'Under 9.5 Corners',
    [MarketType.UNDER_105_CORNERS]: 'Under 10.5 Corners',
    [MarketType.CORNERS_HANDICAP]: 'Corners Handicap',
  }
  return marketNames[market] || market
}

/**
 * Format time window for display
 */
function formatTimeWindow(window: TimeWindow | undefined): string {
  if (!window) return ''
  const windowNames: Record<TimeWindow, string> = {
    [TimeWindow.WINDOW_A]: 'Ventana A',
    [TimeWindow.WINDOW_B]: 'Ventana B',
    [TimeWindow.WINDOW_C]: 'Ventana C',
  }
  return windowNames[window] || window
}

/**
 * Format combo type for display
 */
function formatComboType(type: string): string {
  const typeNames: Record<string, string> = {
    GEMELA: 'COMBO GEMELA',
    CROSS_MERCADO: 'COMBO CROSS-MERCADO',
    CROSS_LIGA: 'COMBO CROSS-LIGA',
    TRIPLE: 'COMBO TRIPLE',
    DOBLE_GEMELA: 'DOBLE GEMELA',
    GEMELA_INVERTIDA: 'GEMELA INVERTIDA',
    SHARP_GEMELA: 'SHARP GEMELA',
    SHARP_CROSS_MERCADO: 'SHARP CROSS-MERCADO',
  }
  return typeNames[type] || type
}

/**
 * Get score badge
 */
function getScoreBadge(score: number): string {
  if (score >= 80) return '\u2B50 ELITE'
  if (score >= 65) return 'FUERTE'
  if (score >= 50) return 'MODERADO'
  return 'DEBIL'
}

@Injectable()
export class BettingTelegramFormatters {
  /**
   * Format stake as units with dollar amount
   * Public wrapper for formatStakeUnits function
   */
  formatStake(stakeDollars: number, unitValue: number = 10): string {
    return formatStakeUnits(stakeDollars, unitValue)
  }

  /**
   * Format Alert 1: Nightly Analysis
   * Supports two modes:
   * - 'initial': First alert of the day with full summary
   * - 'update': Incremental alert when new picks are detected
   */
  formatNightlyAnalysisAlert(
    date: Date,
    picks: BettingPickDocument[],
    combos: BettingComboDocument[],
    bankroll: number,
    totalExposure: number,
    fixturesAnalyzed: number,
    leaguesAnalyzed: number,
    alertType: 'initial' | 'update' = 'initial',
    totalPicks?: number,
    totalCombos?: number,
    unitValue: number = 10  // Value of 1 unit in dollars (default $10)
  ): string {
    const dateStr = formatDate(date)

    let message: string

    if (alertType === 'update') {
      // Incremental update - new picks detected
      message = `🆕 NUEVOS PICKS DETECTADOS\n`
      message += '━'.repeat(23) + '\n\n'
      message += `📊 ${picks.length} nuevo${picks.length !== 1 ? 's' : ''} pick${picks.length !== 1 ? 's' : ''}`
      if (combos.length > 0) {
        message += ` | ${combos.length} combinada${combos.length !== 1 ? 's' : ''}`
      }
      message += '\n'
      if (totalPicks) {
        message += `📈 Total para ${dateStr}: ${totalPicks} picks\n`
      }
      message += '\n'
    } else {
      // Initial alert - full summary
      message = `🎯 ANÁLISIS ${dateStr}\n`
      message += '━'.repeat(23) + '\n\n'
      message += `📊 ${fixturesAnalyzed} partidos analizados | ${leaguesAnalyzed} ligas\n`
      message += `✅ ${picks.length} picks con value | ${combos.length} combinadas\n\n`
    }

    // Individual picks
    if (picks.length > 0) {
      message += '\u2501\u2501\u2501 PICKS INDIVIDUALES \u2501\u2501\u2501\n\n'

      picks.forEach((pick, index) => {
        const odds = (pick.oddsAtDetection || 0).toFixed(2)
        const stakeUnits = formatStakeUnits(pick.stake || 0, unitValue)
        const kickoffTime = formatTime(pick.kickoff)
        const stars = '\u2b50'.repeat(pick.stars || 3)
        const reasons = pick.reasons || []

        message += `${index + 1}\ufe0f\u20e3 ${pick.teamHome.name} vs ${pick.teamAway.name}\n`
        message += `   ${pick.league.name}\n`
        message += `   \u26bd ${formatMarket(pick.market, pick)} @${odds} ${stars}\n`

        // Show all reasons (human-readable)
        reasons.forEach((reason) => {
          message += `   \ud83d\udca1 ${reason}\n`
        })

        // Show stake suggestion in units
        if (pick.stake && pick.stake > 0) {
          message += `   \ud83d\udcb5 Stake: ${stakeUnits}\n`
        }

        message += `   \u23f0 ${kickoffTime}\n`

        // Add betting instructions for corners handicap
        if (pick.market === MarketType.CORNERS_HANDICAP) {
          message += this.formatHandicapInstructions(pick)
        }

        message += '\n'
      })
    }

    // Combos
    if (combos.length > 0) {
      message += '\u2501\u2501\u2501 COMBINADAS \u2501\u2501\u2501\n\n'

      combos.forEach((combo) => {
        const comboType = formatComboType(combo.type)
        const scoreBadge = getScoreBadge(combo.score || 0)
        const ev = ((combo.evReal || 0) * 100).toFixed(1)
        const stakeUnits = formatStakeUnits(combo.stake || 0, unitValue)
        const hiddenEdge = ((combo.hiddenEdge || 0) * 100).toFixed(1)

        message += `\ud83d\udd17 ${comboType}\n`

        combo.legs.forEach((leg: any, legIndex: number) => {
          const teamName = leg.homeTeam && leg.awayTeam
            ? `${leg.homeTeam} vs ${leg.awayTeam}`
            : 'TBD'
          message += `   Pata ${legIndex + 1}: ${teamName}\n`
          message += `      ${formatMarket(leg.market)} @${(leg.odds || 0).toFixed(2)}\n`
        })

        message += `   Cuota combinada: @${(combo.combinedOdds || 0).toFixed(2)}\n`
        if (combo.correlation?.dynamic) {
          message += `   Correlacion: ${combo.correlation.dynamic.toFixed(2)} | EV real: ${ev}%\n`
        }
        message += `   Score: ${combo.score || 0}/100 ${scoreBadge}\n`
        message += `   Stake: ${stakeUnits}\n`
        if (combo.hiddenEdge && combo.hiddenEdge > 0) {
          message += `   \ud83d\udca1 Edge oculto por correlacion: +${hiddenEdge}%\n`
        }
        message += '\n'
      })
    }

    // Footer
    const exposureUnits = formatStakeUnits(totalExposure, unitValue)
    message += '\u2501'.repeat(23) + '\n'
    message += `\ud83d\udcb0 Exposicion total: ${exposureUnits} (${((totalExposure / bankroll) * 100).toFixed(1)}% de bankroll)\n`
    message += `\ud83d\udccb 1u = $${unitValue}\n`
    message += `\ud83d\udd50 Proxima alerta: Sab 6:30 AM (verificacion pre-partido)`

    return message
  }

  /**
   * Format Alert 2: Pre-Match Verification
   * Sent Saturday 6:30 AM
   */
  formatPreMatchAlert(
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
    }>,
    totalExposure: number,
    unitValue: number = 10
  ): string {
    let message = `\u26a1 VERIFICACION PRE-PARTIDO\n`
    message += '\u2501'.repeat(23) + '\n\n'

    // Individual picks status
    const confirmed = picks.filter(p => p.status === 'confirmed' || p.status === 'steam_favorable')
    const cancelled = picks.filter(p => p.status === 'cancelled')

    confirmed.forEach(({ pick, status, newOdds, newEdge, confidenceChange }) => {
      const odds = (newOdds || pick.oddsAtDetection || 0).toFixed(2)
      const market = formatMarket(pick.market, pick)

      if (status === 'steam_favorable') {
        message += `\u2705 ${pick.teamHome.name} ${market} \u2014 Cuota bajo a @${odds} \u2192 STEAM MOVE \u2193\n`
        message += `   \u26a0\ufe0f Dinero entrando al Over \u2192 CONFIRMA nuestra senal\n`
        if (confidenceChange) {
          message += `   Confianza: ${pick.confidenceScore} \u2192 ${pick.confidenceScore + confidenceChange} (+${confidenceChange})\n`
        }
      } else {
        if (newEdge && newEdge > (pick.edge || 0)) {
          message += `\u2705 ${pick.teamHome.name} ${market} \u2014 Cuota subio a @${odds} \u2192 Edge mejoro a ${(newEdge * 100).toFixed(1)}%\n`
        } else {
          message += `\u2705 ${pick.teamHome.name} ${market} \u2014 Cuota se mantuvo @${odds} \u2192 CONFIRMAR\n`
        }
      }
    })

    cancelled.forEach(({ pick, reason }) => {
      const market = formatMarket(pick.market, pick)
      message += `\u274c ${pick.teamHome.name} ${market} \u2014 ${reason || 'Edge insuficiente'}\n`
      message += `   \u2192 CANCELAR\n`
    })

    message += '\n\u2501\u2501\u2501 RESULTADO FINAL \u2501\u2501\u2501\n\n'

    // Execute section
    message += 'EJECUTAR:\n'
    confirmed.forEach(({ pick, newOdds }) => {
      const odds = (newOdds || pick.oddsAtDetection || 0).toFixed(2)
      const stakeFormatted = formatStakeUnits(pick.stake || 0, unitValue)
      const market = formatMarket(pick.market, pick)
      message += `\u2022 ${pick.teamHome.name} ${market} @${odds} \u2014 ${stakeFormatted}\n`
    })

    // Combo status
    combos.filter(c => c.status === 'confirmed').forEach(({ combo }) => {
      const comboStake = formatStakeUnits(combo.stake || 0, unitValue)
      message += `\u2022 ${formatComboType(combo.type)}: @${(combo.combinedOdds || 0).toFixed(2)} \u2014 ${comboStake}\n`
    })

    // Cancelled section
    if (cancelled.length > 0 || combos.filter(c => c.status === 'cancelled').length > 0) {
      message += '\nCANCELADOS:\n'
      cancelled.forEach(({ pick, reason }) => {
        message += `\u2022 ${pick.teamHome.name} ${formatMarket(pick.market, pick)} \u2014 ${reason || 'edge insuficiente'}\n`
      })
      combos.filter(c => c.status === 'cancelled').forEach(({ combo, reason }) => {
        message += `\u2022 ${formatComboType(combo.type)} \u2014 ${reason || 'cancelada'}\n`
      })
    }

    const exposureFormatted = formatStakeUnits(totalExposure, unitValue)
    message += `\n\ud83d\udcb0 Exposicion final: ${exposureFormatted}`

    return message
  }

  /**
   * Format Alert 3: Daily Results
   * Sent Saturday night / Sunday morning
   */
  formatResultsAlert(
    date: Date,
    picks: BettingPickDocument[],
    combos: BettingComboDocument[],
    bankrollBefore: number,
    bankrollAfter: number,
    seasonStats: {
      totalBets: number
      avgCLV: number
      roi: number
      currentStreak: number
    }
  ): string {
    const dateStr = formatDate(date)

    let message = `\ud83d\udcca RESULTADOS ${dateStr}\n`
    message += '\u2501'.repeat(23) + '\n\n'

    // Individual pick results
    let dayProfit = 0
    let picksWon = 0
    let picksLost = 0
    let totalCLV = 0

    picks.forEach((pick) => {
      const statusIcon = pick.status === PickStatus.WON ? '\u2705' : '\u274c'
      const market = formatMarket(pick.market, pick)
      const odds = (pick.oddsAtBet || pick.oddsAtDetection || 0).toFixed(2)
      const profit = pick.profit || 0
      const clv = ((pick.clv || 0) * 100).toFixed(1)

      dayProfit += profit
      totalCLV += pick.clv || 0
      if (pick.status === PickStatus.WON) picksWon++
      if (pick.status === PickStatus.LOST) picksLost++

      const resultText = pick.matchResult?.scoreHT
        ? `(HT: ${pick.matchResult.scoreHT})`
        : ''

      message += `${statusIcon} ${pick.teamHome.name} vs ${pick.teamAway.name} ${resultText} \u2014 ${market} ${statusIcon === '\u2705' ? 'WIN' : 'LOSE'}\n`
      message += `   Cuota: @${odds} | ${profit >= 0 ? 'Profit' : 'Loss'}: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}\n`
      message += `   CLV: ${parseFloat(clv) >= 0 ? '+' : ''}${clv}%${parseFloat(clv) >= 3 ? ' \ud83d\udd25' : ''}\n\n`
    })

    // Combo results
    let combosWon = 0
    let combosLost = 0

    combos.forEach((combo) => {
      const statusIcon = combo.status === ComboStatus.WON ? '\u2705' : '\u274c'
      const comboType = formatComboType(combo.type)
      const odds = (combo.combinedOdds || 0).toFixed(2)
      const profit = combo.profit || 0

      dayProfit += profit
      if (combo.status === ComboStatus.WON) combosWon++
      if (combo.status === ComboStatus.LOST) combosLost++

      message += `${statusIcon} ${comboType} ${statusIcon === '\u2705' ? 'WIN' : 'LOSE'}\n`
      message += `   Cuota: @${odds} | ${profit >= 0 ? 'Profit' : 'Loss'}: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}\n\n`
    })

    // Day summary
    const avgCLV = picks.length > 0 ? (totalCLV / picks.length) * 100 : 0
    const picksWinRate = picks.length > 0 ? (picksWon / picks.length) * 100 : 0
    const combosWinRate = combos.length > 0 ? (combosWon / combos.length) * 100 : 0

    message += '\u2501\u2501\u2501 RESUMEN DEL DIA \u2501\u2501\u2501\n\n'
    message += `Picks: ${picksWon}W ${picksLost}L | Win rate: ${picksWinRate.toFixed(0)}%\n`
    message += `Combos: ${combosWon}W ${combosLost}L | Win rate: ${combosWinRate.toFixed(0)}%\n`
    message += `Profit del dia: ${dayProfit >= 0 ? '+' : ''}$${dayProfit.toFixed(2)}\n`
    message += `CLV promedio: ${avgCLV >= 0 ? '+' : ''}${avgCLV.toFixed(1)}% ${avgCLV >= 0 ? '\u2705 POSITIVO' : '\u26a0\ufe0f NEGATIVO'}\n`
    message += `Bankroll: $${bankrollBefore.toFixed(2)} \u2192 $${bankrollAfter.toFixed(2)}\n\n`

    // Season stats
    message += '\u2501\u2501\u2501 ACUMULADO TEMPORADA \u2501\u2501\u2501\n\n'
    message += `Total apuestas: ${seasonStats.totalBets}\n`
    message += `CLV promedio: ${seasonStats.avgCLV >= 0 ? '+' : ''}${(seasonStats.avgCLV * 100).toFixed(1)}%\n`
    message += `ROI: ${seasonStats.roi >= 0 ? '+' : ''}${(seasonStats.roi * 100).toFixed(1)}%\n`
    message += `Bankroll: $100 \u2192 $${bankrollAfter.toFixed(2)}\n`
    message += `Racha actual: ${seasonStats.currentStreak >= 0 ? seasonStats.currentStreak + 'W' : Math.abs(seasonStats.currentStreak) + 'L'}`

    return message
  }

  /**
   * Format quick picks summary for /picks command
   */
  formatPicksSummary(picks: BettingPickDocument[]): string {
    if (picks.length === 0) {
      return '\ud83d\udcca No hay picks para hoy'
    }

    let message = `\ud83c\udfaf PICKS DE HOY (${picks.length})\n`
    message += '\u2501'.repeat(20) + '\n\n'

    picks.forEach((pick, index) => {
      const statusIcon = this.getStatusIcon(pick.status)
      const market = formatMarket(pick.market, pick)
      const odds = (pick.oddsAtDetection || 0).toFixed(2)
      const time = formatTime(pick.kickoff)

      message += `${index + 1}. ${statusIcon} ${pick.teamHome.name} vs ${pick.teamAway.name}\n`
      message += `   ${market} @${odds} | ${time}\n`
    })

    return message
  }

  /**
   * Format combos summary for /combos command
   */
  formatCombosSummary(combos: BettingComboDocument[]): string {
    if (combos.length === 0) {
      return '\ud83d\udd17 No hay combinadas para hoy'
    }

    let message = `\ud83d\udd17 COMBINADAS DE HOY (${combos.length})\n`
    message += '\u2501'.repeat(20) + '\n\n'

    combos.forEach((combo, index) => {
      const statusIcon = this.getComboStatusIcon(combo.status)
      const comboType = formatComboType(combo.type)
      const odds = (combo.combinedOdds || 0).toFixed(2)

      message += `${index + 1}. ${statusIcon} ${comboType}\n`
      message += `   @${odds} | ${combo.legs.length} patas | Score: ${combo.score || 0}/100\n`
    })

    return message
  }

  /**
   * Format bankroll status for /bankroll command
   */
  formatBankrollStatus(
    bankroll: number,
    dailyExposure: number,
    activePicks: number,
    activeCombos: number
  ): string {
    const exposurePct = (dailyExposure / bankroll) * 100

    let message = `\ud83d\udcb0 ESTADO DEL BANKROLL\n`
    message += '\u2501'.repeat(20) + '\n\n'
    message += `Bankroll actual: $${bankroll.toFixed(2)}\n`
    message += `Exposicion hoy: $${dailyExposure.toFixed(2)} (${exposurePct.toFixed(1)}%)\n`
    message += `Picks activos: ${activePicks}\n`
    message += `Combos activos: ${activeCombos}`

    return message
  }

  /**
   * Format stats summary for /stats command
   */
  formatStatsSummary(stats: {
    totalBets: number
    avgCLV: number
    roi: number
    winRate: number
    profit: number
    picksCount: number
    combosCount: number
  }): string {
    let message = `\ud83d\udcca ESTADISTICAS ACUMULADAS\n`
    message += '\u2501'.repeat(23) + '\n\n'
    message += `Total apuestas: ${stats.totalBets}\n`
    message += `  - Picks: ${stats.picksCount}\n`
    message += `  - Combos: ${stats.combosCount}\n\n`
    message += `CLV promedio: ${stats.avgCLV >= 0 ? '+' : ''}${(stats.avgCLV * 100).toFixed(1)}%\n`
    message += `ROI: ${stats.roi >= 0 ? '+' : ''}${(stats.roi * 100).toFixed(1)}%\n`
    message += `Win rate: ${(stats.winRate * 100).toFixed(1)}%\n`
    message += `Profit total: ${stats.profit >= 0 ? '+' : ''}$${stats.profit.toFixed(2)}`

    return message
  }

  /**
   * Format betting instructions for corners handicap
   * Explains HOW to place this bet on Bet365/other bookmakers
   */
  private formatHandicapInstructions(pick: BettingPickDocument): string {
    const line = pick.line || 0
    const direction = pick.direction
    const homeTeam = pick.teamHome.name
    const awayTeam = pick.teamAway.name

    // Determine which team to bet on (OVER = Home team covers, UNDER = Away team covers)
    const isHome = direction === MarketDirection.OVER
    const teamToBet = isHome ? homeTeam : awayTeam
    const lineStr = line >= 0 ? `+${line}` : `${line}`

    let instructions = '\n   \ud83c\udfb0 COMO APOSTAR EN BET365:\n'
    instructions += `   \u2192 Corners Asiaticos > Handicap\n`
    instructions += `   \u2192 Selecciona: "${teamToBet} ${lineStr}"\n`

    // Explain what needs to happen to win
    if (isHome) {
      if (line < 0) {
        const absLine = Math.abs(line)
        instructions += `   \u2192 Para ganar: ${homeTeam} debe ganar\n`
        instructions += `      por ${absLine}+ corners de diferencia\n`
      } else {
        instructions += `   \u2192 Para ganar: ${homeTeam} no debe perder\n`
        instructions += `      por mas de ${line} corners\n`
      }
    } else {
      if (line > 0) {
        instructions += `   \u2192 Para ganar: ${awayTeam} no debe perder\n`
        instructions += `      por mas de ${line} corners\n`
      } else {
        const absLine = Math.abs(line)
        instructions += `   \u2192 Para ganar: ${awayTeam} debe ganar\n`
        instructions += `      por ${absLine}+ corners de diferencia\n`
      }
    }

    return instructions
  }

  /**
   * Format inline buttons for result registration
   */
  formatResultButtons(pickId: string, matchInfo: string): {
    text: string
    buttons: Array<{ text: string; callback_data: string }>
  } {
    return {
      text: matchInfo,
      buttons: [
        { text: '\u2705 WIN', callback_data: `bet_result:${pickId}:won` },
        { text: '\u274c LOSE', callback_data: `bet_result:${pickId}:lost` },
        { text: '\ud83d\udd04 VOID', callback_data: `bet_result:${pickId}:void` },
      ],
    }
  }

  /**
   * Get status icon for pick
   */
  private getStatusIcon(status: PickStatus): string {
    const icons: Record<PickStatus, string> = {
      [PickStatus.PENDING]: '\u23f3',
      [PickStatus.ACTIVE]: '\ud83d\udfe1',
      [PickStatus.WON]: '\u2705',
      [PickStatus.LOST]: '\u274c',
      [PickStatus.VOID]: '\ud83d\udd04',
      [PickStatus.CANCELLED]: '\u26d4',
    }
    return icons[status] || '\u2753'
  }

  /**
   * Get status icon for combo
   */
  private getComboStatusIcon(status: ComboStatus): string {
    const icons: Record<ComboStatus, string> = {
      [ComboStatus.PENDING]: '\u23f3',
      [ComboStatus.WON]: '\u2705',
      [ComboStatus.LOST]: '\u274c',
      [ComboStatus.PARTIAL]: '\ud83d\udfe1',
      [ComboStatus.CANCELLED]: '\u26d4',
    }
    return icons[status] || '\u2753'
  }

  /**
   * Format market label for personal result notification
   */
  formatMarketLabel(market: MarketType, line?: number, direction?: string): string {
    const marketNames: Record<string, string> = {
      'over_05_1h': 'Over 0.5 Goles 1H',
      'over_15_1h': 'Over 1.5 Goles 1H',
      'over_75_corners': 'Over 7.5 Corners',
      'over_85_corners': 'Over 8.5 Corners',
      'over_95_corners': 'Over 9.5 Corners',
      'over_105_corners': 'Over 10.5 Corners',
      'over_115_corners': 'Over 11.5 Corners',
      'over_45_corners_1h': 'Over 4.5 Corners 1H',
      'under_85_corners': 'Under 8.5 Corners',
      'under_95_corners': 'Under 9.5 Corners',
      'under_105_corners': 'Under 10.5 Corners',
      'corners_handicap': 'Corners Handicap',
    }

    const marketStr = String(market).toLowerCase()
    let label = marketNames[marketStr] || market

    // For corners handicap, add line and direction
    if (marketStr === 'corners_handicap' && line !== undefined) {
      const lineStr = line >= 0 ? `+${line}` : `${line}`
      const side = direction === 'OVER' ? 'Local' : 'Visitante'
      label = `Corners Hcap ${side} (${lineStr})`
    }

    return label
  }
}
