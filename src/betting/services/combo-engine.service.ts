import { Injectable, Logger } from '@nestjs/common'
import { ComboType, MarketType, ComboScoreLevel } from '../enums/betting.enums'
import { CorrelationService } from './correlation.service'
import { ValueResult } from './value-detection.service'
import { BettingTeamStats, BettingFixture } from './api-football-betting.service'
import { MatchContext } from './context.service'

/**
 * A single leg (pick) in a combo
 */
export interface ComboLeg {
  fixtureId: number
  leagueId: number
  homeTeam: string
  awayTeam: string
  market: MarketType | string
  direction: 'OVER' | 'UNDER'
  line?: number
  odds: number
  probOwn: number
  edge: number
  confidenceScore: number
  teamAStats?: BettingTeamStats
  teamBStats?: BettingTeamStats
  steamMove?: {
    detected: boolean
    confirms: boolean
    pctChange: number
  }
}

/**
 * Generated combo
 */
export interface GeneratedCombo {
  id: string // Unique identifier for the combo
  type: ComboType
  legs: ComboLeg[]
  // Odds and probabilities
  combinedOdds: number
  pJoint: number // Joint probability with correlation
  pCasa: number // Independent probability (what bookmaker thinks)
  evReal: number // EV with correlation
  evCasa: number // EV without correlation
  hiddenEdge: number // evReal - evCasa
  // Correlation info
  correlation: {
    base: number
    dynamic: number
    adjustments: Array<{ factor: string; value: number }>
  }
  // Scoring
  score: number
  scoreLevel: ComboScoreLevel
  scoreBreakdown: {
    evPoints: number
    correlationPoints: number
    confidencePoints: number
    steamPoints: number
    diversificationPoints: number
    penalties: number
  }
  // Metadata
  sharpConfirmed: boolean
  timeWindow: 'WINDOW_A' | 'WINDOW_B' | 'WINDOW_C'
  warnings: string[]
  contextFlags: string[]
}

/**
 * Pool of value picks available for combo generation
 */
export interface ValuePickPool {
  picks: ComboLeg[]
  fixtureMap: Map<number, ComboLeg[]> // Group by fixture
  byTimeWindow: Map<string, ComboLeg[]>
}

/**
 * EV thresholds by combo type
 */
const EV_THRESHOLDS: Record<ComboType, { min: number; target: number }> = {
  [ComboType.GEMELA]: { min: 0.05, target: 0.15 },
  [ComboType.GEMELA_INVERTIDA]: { min: 0.03, target: 0.08 },
  [ComboType.CROSS_MERCADO]: { min: 0.05, target: 0.1 },
  [ComboType.CROSS_LIGA]: { min: 0.05, target: 0.08 },
  [ComboType.TRIPLE_CORRELACIONADO]: { min: 0.08, target: 0.15 },
  [ComboType.DOBLE_GEMELA]: { min: 0.15, target: 0.25 },
  [ComboType.SHARP_GEMELA]: { min: 0.03, target: 0.15 },
  [ComboType.SHARP_CROSS_MERCADO]: { min: 0.03, target: 0.1 },
}

/**
 * Time window maximum difference in minutes
 */
const MAX_TIME_WINDOW_MINUTES = 180

@Injectable()
export class ComboEngineService {
  private readonly logger = new Logger(ComboEngineService.name)

  constructor(private readonly correlationService: CorrelationService) {}

  /**
   * Generate unique combo ID
   */
  private generateComboId(type: ComboType, legs: ComboLeg[]): string {
    const fixtureIds = legs.map((l) => l.fixtureId).sort().join('-')
    const markets = legs.map((l) => String(l.market).substring(0, 4)).join('')
    const timestamp = Date.now().toString(36)
    return `${type}_${fixtureIds}_${markets}_${timestamp}`
  }

  /**
   * Run the complete combo engine
   * Implements run_combo_engine from COMBINADAS doc section 13
   */
  runComboEngine(
    valuePicks: ComboLeg[],
    contexts: Map<number, MatchContext>
  ): GeneratedCombo[] {
    const allCombos: GeneratedCombo[] = []

    // Group picks by fixture
    const fixtureMap = this.groupByFixture(valuePicks)

    // Group by time window
    const timeWindows = this.groupByTimeWindow(valuePicks)

    // ================================================
    // STEP 1: Generate GEMELA combos (same match)
    // ================================================
    const gemelas: GeneratedCombo[] = []

    for (const [fixtureId, fixturePicks] of fixtureMap.entries()) {
      const goalsPicks = fixturePicks.filter((p) => this.isGoalsMarket(p.market))
      const cornersPicks = fixturePicks.filter((p) =>
        this.isCornersMarket(p.market)
      )

      if (goalsPicks.length > 0 && cornersPicks.length > 0) {
        // Find best goal and corner pick
        const bestGoal = this.selectBestPick(goalsPicks)
        const bestCorner = this.selectBestPick(cornersPicks)

        const context = contexts.get(fixtureId)
        const gemela = this.createGemela(bestGoal, bestCorner, context)

        if (gemela && gemela.evReal >= EV_THRESHOLDS[ComboType.GEMELA].min) {
          gemelas.push(gemela)
          allCombos.push(gemela)
        }
      }
    }

    this.logger.log(`Generated ${gemelas.length} GEMELA combos`)

    // ================================================
    // STEP 2: Generate CROSS combos (different matches)
    // ================================================
    for (const [windowName, windowPicks] of timeWindows.entries()) {
      if (windowPicks.length < 2) continue

      const crossCombos = this.generateCrossCombos(windowPicks, windowName)
      allCombos.push(...crossCombos)
    }

    // ================================================
    // STEP 3: Generate TRIPLE combos
    // ================================================
    for (const [windowName, windowPicks] of timeWindows.entries()) {
      const windowGemelas = gemelas.filter((g) =>
        this.isInTimeWindow(g, windowName)
      )

      for (const gemela of windowGemelas) {
        // Find individual picks not in the gemela's fixture
        const availablePicks = windowPicks.filter(
          (p) => !gemela.legs.some((leg) => leg.fixtureId === p.fixtureId)
        )

        if (availablePicks.length > 0) {
          const bestPick = this.selectBestPick(availablePicks)
          const triple = this.createTriple(gemela, bestPick)

          if (
            triple &&
            triple.evReal >= EV_THRESHOLDS[ComboType.TRIPLE_CORRELACIONADO].min
          ) {
            allCombos.push(triple)
          }
        }
      }
    }

    // ================================================
    // STEP 4: Generate DOBLE_GEMELA (rare, 2 gemelas)
    // ================================================
    for (const [windowName, windowPicks] of timeWindows.entries()) {
      const windowGemelas = gemelas.filter((g) =>
        this.isInTimeWindow(g, windowName)
      )

      if (windowGemelas.length >= 2) {
        // Sort by score and take top 2
        windowGemelas.sort((a, b) => b.score - a.score)
        const top2 = windowGemelas.slice(0, 2)

        if (top2[0].score >= 70 && top2[1].score >= 70) {
          const dobleGemela = this.createDobleGemela(top2[0], top2[1])
          if (
            dobleGemela &&
            dobleGemela.evReal >= EV_THRESHOLDS[ComboType.DOBLE_GEMELA].min
          ) {
            allCombos.push(dobleGemela)
          }
        }
      }
    }

    // ================================================
    // STEP 5: Mark SHARP combos (steam moves)
    // ================================================
    for (const combo of allCombos) {
      this.markSharpIfApplicable(combo)
    }

    // Sort by score
    allCombos.sort((a, b) => b.score - a.score)

    this.logger.log(`Total combos generated: ${allCombos.length}`)

    return allCombos
  }

  /**
   * Create a GEMELA combo (same match: goals + corners)
   */
  createGemela(
    goalsLeg: ComboLeg,
    cornersLeg: ComboLeg,
    context?: MatchContext
  ): GeneratedCombo | null {
    // Calculate correlation
    const corrResult = this.correlationService.calculateDynamicCorrelation(
      { fixtureId: goalsLeg.fixtureId, leagueId: goalsLeg.leagueId } as BettingFixture,
      goalsLeg.market,
      cornersLeg.market,
      goalsLeg.teamAStats!,
      goalsLeg.teamBStats!
    )

    // Check minimum correlation threshold
    if (corrResult.finalCorrelation < 0.3) {
      this.logger.debug(
        `GEMELA rejected: correlation ${corrResult.finalCorrelation.toFixed(2)} < 0.30`
      )
      return null
    }

    // Combined odds
    const combinedOdds = goalsLeg.odds * cornersLeg.odds

    // Joint probability with correlation
    const pJoint = this.correlationService.jointProbability(
      goalsLeg.probOwn,
      cornersLeg.probOwn,
      corrResult.finalCorrelation
    )

    // Independent probability (bookmaker's assumption)
    const pCasa = goalsLeg.probOwn * cornersLeg.probOwn

    // EV calculations
    const evReal = pJoint * combinedOdds - 1
    const evCasa = pCasa * combinedOdds - 1
    const hiddenEdge = evReal - evCasa

    // Build legs array
    const legs: ComboLeg[] = [goalsLeg, cornersLeg]

    // Calculate score
    const { score, breakdown } = this.scoreCombo(
      ComboType.GEMELA,
      legs,
      evReal,
      hiddenEdge,
      corrResult.finalCorrelation
    )

    // Determine time window
    const timeWindow = this.determineTimeWindow(new Date())

    // Context flags
    const contextFlags = context?.flags || []

    return {
      id: this.generateComboId(ComboType.GEMELA, legs),
      type: ComboType.GEMELA,
      legs,
      combinedOdds,
      pJoint,
      pCasa,
      evReal,
      evCasa,
      hiddenEdge,
      correlation: {
        base: corrResult.baseCorrelation,
        dynamic: corrResult.finalCorrelation,
        adjustments: corrResult.adjustments,
      },
      score,
      scoreLevel: this.getScoreLevel(score),
      scoreBreakdown: breakdown,
      sharpConfirmed: false,
      timeWindow,
      warnings: [],
      contextFlags,
    }
  }

  /**
   * Generate CROSS combos (different matches, same market or different)
   */
  generateCrossCombos(
    picks: ComboLeg[],
    windowName: string
  ): GeneratedCombo[] {
    const combos: GeneratedCombo[] = []

    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const pickA = picks[i]
        const pickB = picks[j]

        // Skip if same fixture
        if (pickA.fixtureId === pickB.fixtureId) continue

        // Determine combo type
        const sameMarketType =
          this.isGoalsMarket(pickA.market) === this.isGoalsMarket(pickB.market)
        const sameLeague = pickA.leagueId === pickB.leagueId

        // Skip same league (correlated by external factors)
        if (sameLeague) continue

        const comboType = sameMarketType
          ? ComboType.CROSS_LIGA
          : ComboType.CROSS_MERCADO

        // Cross-match correlation is minimal
        const correlation = 0.05

        const combinedOdds = pickA.odds * pickB.odds
        const pJoint = this.correlationService.jointProbability(
          pickA.probOwn,
          pickB.probOwn,
          correlation
        )
        const pCasa = pickA.probOwn * pickB.probOwn
        const evReal = pJoint * combinedOdds - 1
        const evCasa = pCasa * combinedOdds - 1
        const hiddenEdge = evReal - evCasa

        // Check minimum EV
        if (evReal < EV_THRESHOLDS[comboType].min) continue

        const legs = [pickA, pickB]
        const { score, breakdown } = this.scoreCombo(
          comboType,
          legs,
          evReal,
          hiddenEdge,
          correlation
        )

        const timeWindow = this.determineTimeWindow(new Date())

        combos.push({
          id: this.generateComboId(comboType, legs),
          type: comboType,
          legs,
          combinedOdds,
          pJoint,
          pCasa,
          evReal,
          evCasa,
          hiddenEdge,
          correlation: {
            base: correlation,
            dynamic: correlation,
            adjustments: [],
          },
          score,
          scoreLevel: this.getScoreLevel(score),
          scoreBreakdown: breakdown,
          sharpConfirmed: false,
          timeWindow,
          warnings: [],
          contextFlags: [],
        })
      }
    }

    // Sort by EV and take top 3
    combos.sort((a, b) => b.evReal - a.evReal)
    return combos.slice(0, 3)
  }

  /**
   * Create a TRIPLE combo (gemela + independent pick)
   */
  createTriple(
    gemela: GeneratedCombo,
    thirdPick: ComboLeg
  ): GeneratedCombo | null {
    const combinedOdds = gemela.combinedOdds * thirdPick.odds

    // Triple probability: gemela (correlated) × third pick (independent)
    const crossCorr = 0.05 // Minimal cross-match correlation
    const pJoint = this.correlationService.jointProbability(
      gemela.pJoint,
      thirdPick.probOwn,
      crossCorr
    )

    const pCasa = gemela.pCasa * thirdPick.probOwn
    const evReal = pJoint * combinedOdds - 1
    const evCasa = pCasa * combinedOdds - 1
    const hiddenEdge = evReal - evCasa

    // Check minimum EV
    if (evReal < EV_THRESHOLDS[ComboType.TRIPLE_CORRELACIONADO].min) {
      return null
    }

    const legs = [...gemela.legs, thirdPick]
    const { score, breakdown } = this.scoreCombo(
      ComboType.TRIPLE_CORRELACIONADO,
      legs,
      evReal,
      hiddenEdge,
      gemela.correlation.dynamic
    )

    return {
      id: this.generateComboId(ComboType.TRIPLE_CORRELACIONADO, legs),
      type: ComboType.TRIPLE_CORRELACIONADO,
      legs,
      combinedOdds,
      pJoint,
      pCasa,
      evReal,
      evCasa,
      hiddenEdge,
      correlation: gemela.correlation,
      score,
      scoreLevel: this.getScoreLevel(score),
      scoreBreakdown: breakdown,
      sharpConfirmed: gemela.sharpConfirmed,
      timeWindow: gemela.timeWindow,
      warnings: [],
      contextFlags: gemela.contextFlags,
    }
  }

  /**
   * Create a DOBLE_GEMELA combo (2 gemelas)
   */
  createDobleGemela(
    gemela1: GeneratedCombo,
    gemela2: GeneratedCombo
  ): GeneratedCombo | null {
    const combinedOdds = gemela1.combinedOdds * gemela2.combinedOdds

    // Two pairs are independent of each other
    const pJoint = gemela1.pJoint * gemela2.pJoint
    const pCasa = gemela1.pCasa * gemela2.pCasa
    const evReal = pJoint * combinedOdds - 1
    const evCasa = pCasa * combinedOdds - 1
    const hiddenEdge = evReal - evCasa

    if (evReal < EV_THRESHOLDS[ComboType.DOBLE_GEMELA].min) {
      return null
    }

    const legs = [...gemela1.legs, ...gemela2.legs]
    const { score, breakdown } = this.scoreCombo(
      ComboType.DOBLE_GEMELA,
      legs,
      evReal,
      hiddenEdge,
      (gemela1.correlation.dynamic + gemela2.correlation.dynamic) / 2
    )

    return {
      id: this.generateComboId(ComboType.DOBLE_GEMELA, legs),
      type: ComboType.DOBLE_GEMELA,
      legs,
      combinedOdds,
      pJoint,
      pCasa,
      evReal,
      evCasa,
      hiddenEdge,
      correlation: {
        base: 0,
        dynamic: 0,
        adjustments: [],
      },
      score,
      scoreLevel: this.getScoreLevel(score),
      scoreBreakdown: breakdown,
      sharpConfirmed: gemela1.sharpConfirmed || gemela2.sharpConfirmed,
      timeWindow: gemela1.timeWindow,
      warnings: [],
      contextFlags: [...gemela1.contextFlags, ...gemela2.contextFlags],
    }
  }

  /**
   * Score a combo (0-100)
   * Implements score_combo from COMBINADAS doc section 6
   */
  scoreCombo(
    type: ComboType,
    legs: ComboLeg[],
    evReal: number,
    hiddenEdge: number,
    correlation: number
  ): {
    score: number
    breakdown: GeneratedCombo['scoreBreakdown']
  } {
    let score = 0

    // BLOCK 1: EV Real (0-30 points)
    let evPoints = 0
    if (evReal >= 0.25) evPoints = 30
    else if (evReal >= 0.2) evPoints = 27
    else if (evReal >= 0.15) evPoints = 24
    else if (evReal >= 0.1) evPoints = 20
    else if (evReal >= 0.08) evPoints = 16
    else if (evReal >= 0.05) evPoints = 12
    else if (evReal >= 0.03) evPoints = 8
    score += evPoints

    // BLOCK 2: Hidden edge from correlation (0-20 points)
    let correlationPoints = 0
    if (hiddenEdge >= 0.15) correlationPoints = 20
    else if (hiddenEdge >= 0.1) correlationPoints = 16
    else if (hiddenEdge >= 0.05) correlationPoints = 12
    else if (hiddenEdge >= 0.02) correlationPoints = 8
    else if (hiddenEdge > 0) correlationPoints = 4
    score += correlationPoints

    // BLOCK 3: Individual leg confidence (0-20 points)
    const minConfidence = Math.min(...legs.map((l) => l.confidenceScore))
    const avgConfidence =
      legs.reduce((sum, l) => sum + l.confidenceScore, 0) / legs.length
    const confScore = minConfidence * 0.6 + avgConfidence * 0.4
    const confidencePoints = Math.min(20, Math.floor(confScore / 5))
    score += confidencePoints

    // BLOCK 4: Steam moves (0-15 points)
    let steamPoints = 0
    const steamConfirmedCount = legs.filter(
      (l) => l.steamMove?.detected && l.steamMove.confirms
    ).length
    const steamContraCount = legs.filter(
      (l) => l.steamMove?.detected && !l.steamMove.confirms
    ).length

    if (steamConfirmedCount === legs.length) steamPoints = 15
    else if (steamConfirmedCount >= 1) steamPoints = 10

    if (steamContraCount > 0) steamPoints -= 20
    score += steamPoints

    // BLOCK 5: Diversification (0-10 points)
    let diversificationPoints = 0
    const markets = new Set(legs.map((l) => this.getMarketCategory(l.market)))
    const leagues = new Set(legs.map((l) => l.leagueId))

    if (markets.size >= 2) diversificationPoints += 5
    if (leagues.size >= 2) diversificationPoints += 5
    score += diversificationPoints

    // BLOCK 6: Penalties
    let penalties = 0

    // High combined odds penalty
    const combinedOdds = legs.reduce((prod, l) => prod * l.odds, 1)
    if (combinedOdds > 5.0) penalties += 10
    else if (combinedOdds > 4.0) penalties += 5

    // Small sample penalty
    const minGames = Math.min(
      ...legs.map((l) => l.teamAStats?.gamesPlayed || 20)
    )
    if (minGames < 10) penalties += 10
    else if (minGames < 15) penalties += 5

    // Too many legs penalty
    if (legs.length > 3 && type !== ComboType.DOBLE_GEMELA) {
      penalties += 15
    }

    score -= penalties

    // Clamp score
    score = Math.max(0, Math.min(100, score))

    return {
      score,
      breakdown: {
        evPoints,
        correlationPoints,
        confidencePoints,
        steamPoints,
        diversificationPoints,
        penalties,
      },
    }
  }

  /**
   * Mark combo as SHARP if it has steam moves
   */
  markSharpIfApplicable(combo: GeneratedCombo): void {
    const hasSharp = combo.legs.some(
      (l) => l.steamMove?.detected && l.steamMove.confirms
    )

    if (hasSharp) {
      combo.sharpConfirmed = true

      // Upgrade combo type to SHARP variant
      if (combo.type === ComboType.GEMELA) {
        combo.type = ComboType.SHARP_GEMELA
      } else if (combo.type === ComboType.CROSS_MERCADO) {
        combo.type = ComboType.SHARP_CROSS_MERCADO
      }
    }
  }

  // ============ Helper methods ============

  private groupByFixture(picks: ComboLeg[]): Map<number, ComboLeg[]> {
    const map = new Map<number, ComboLeg[]>()
    for (const pick of picks) {
      const existing = map.get(pick.fixtureId) || []
      existing.push(pick)
      map.set(pick.fixtureId, existing)
    }
    return map
  }

  private groupByTimeWindow(
    picks: ComboLeg[]
  ): Map<string, ComboLeg[]> {
    // For now, group all in same window
    // In production, would use kickoff times
    return new Map([['WINDOW_A', picks]])
  }

  private selectBestPick(picks: ComboLeg[]): ComboLeg {
    return picks.reduce((best, current) =>
      current.edge > best.edge ? current : best
    )
  }

  private isGoalsMarket(market: MarketType | string): boolean {
    const m = String(market).toUpperCase()
    return m.includes('GOAL') || (m.includes('OVER') && m.includes('1H') && !m.includes('CORNER'))
  }

  private isCornersMarket(market: MarketType | string): boolean {
    const m = String(market).toUpperCase()
    return m.includes('CORNER')
  }

  private getMarketCategory(market: MarketType | string): string {
    if (this.isGoalsMarket(market)) return 'GOALS'
    if (this.isCornersMarket(market)) return 'CORNERS'
    return 'OTHER'
  }

  private isInTimeWindow(combo: GeneratedCombo, windowName: string): boolean {
    return combo.timeWindow === windowName || windowName === 'WINDOW_A'
  }

  private determineTimeWindow(
    date: Date
  ): 'WINDOW_A' | 'WINDOW_B' | 'WINDOW_C' {
    const hour = date.getHours()
    if (hour < 14) return 'WINDOW_A'
    if (hour < 18) return 'WINDOW_B'
    return 'WINDOW_C'
  }

  private getScoreLevel(score: number): ComboScoreLevel {
    if (score >= 80) return ComboScoreLevel.ELITE
    if (score >= 65) return ComboScoreLevel.FUERTE
    if (score >= 50) return ComboScoreLevel.SOLIDA
    if (score >= 35) return ComboScoreLevel.MARGINAL
    return ComboScoreLevel.DESCARTAR
  }
}
