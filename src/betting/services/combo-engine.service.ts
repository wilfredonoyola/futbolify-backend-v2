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
    // STEP 1: Generate GEMELA combos (same match, multiple markets)
    // ================================================
    const gemelas: GeneratedCombo[] = []

    for (const [fixtureId, fixturePicks] of fixtureMap.entries()) {
      const goalsPicks = fixturePicks.filter((p) => this.isGoalsMarket(p.market))
      const cornersPicks = fixturePicks.filter((p) =>
        this.isCornersMarket(p.market)
      )
      const cardsPicks = fixturePicks.filter((p) => this.isCardsMarket(p.market))
      const bttsPicks = fixturePicks.filter((p) => this.isBTTSMarket(p.market))

      const context = contexts.get(fixtureId)

      // Define all valid market pairs for GEMELA (correlation > 0.25)
      const marketPairs: Array<{
        pickListA: ComboLeg[]
        pickListB: ComboLeg[]
        name: string
      }> = [
        { pickListA: goalsPicks, pickListB: cornersPicks, name: 'Goals+Corners' },
        { pickListA: goalsPicks, pickListB: cardsPicks, name: 'Goals+Cards' },
        { pickListA: goalsPicks, pickListB: bttsPicks, name: 'Goals+BTTS' },
        { pickListA: cornersPicks, pickListB: cardsPicks, name: 'Corners+Cards' },
        { pickListA: bttsPicks, pickListB: cornersPicks, name: 'BTTS+Corners' },
        { pickListA: bttsPicks, pickListB: cardsPicks, name: 'BTTS+Cards' },
      ]

      // Generate GEMELA for each valid pair
      for (const { pickListA, pickListB, name } of marketPairs) {
        if (pickListA.length > 0 && pickListB.length > 0) {
          const bestA = this.selectBestPick(pickListA)
          const bestB = this.selectBestPick(pickListB)

          const gemela = this.createGemela(bestA, bestB, context)

          if (gemela && gemela.evReal >= EV_THRESHOLDS[ComboType.GEMELA].min) {
            this.logger.debug(
              `GEMELA ${name}: fixture ${fixtureId}, EV=${(gemela.evReal * 100).toFixed(1)}%`
            )
            gemelas.push(gemela)
            allCombos.push(gemela)
          }
        }
      }

      // Generate GEMELA_TRIPLE if 3+ different market categories available
      const marketCategories = [
        { picks: goalsPicks, category: 'GOALS' },
        { picks: cornersPicks, category: 'CORNERS' },
        { picks: cardsPicks, category: 'CARDS' },
        { picks: bttsPicks, category: 'BTTS' },
      ].filter((m) => m.picks.length > 0)

      if (marketCategories.length >= 3) {
        // Select best pick from each category
        const bestPicks = marketCategories
          .map((m) => this.selectBestPick(m.picks))
          .slice(0, 3) // Take top 3

        const tripleGemela = this.createTripleGemela(bestPicks, context)
        if (
          tripleGemela &&
          tripleGemela.evReal >= EV_THRESHOLDS[ComboType.TRIPLE_CORRELACIONADO].min
        ) {
          this.logger.debug(
            `GEMELA_TRIPLE: fixture ${fixtureId}, EV=${(tripleGemela.evReal * 100).toFixed(1)}%`
          )
          allCombos.push(tripleGemela)
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
   * Create a GEMELA combo (same match: any two correlated markets)
   */
  createGemela(
    legA: ComboLeg,
    legB: ComboLeg,
    context?: MatchContext
  ): GeneratedCombo | null {
    // Calculate correlation
    const corrResult = this.correlationService.calculateDynamicCorrelation(
      { fixtureId: legA.fixtureId, leagueId: legA.leagueId } as BettingFixture,
      legA.market,
      legB.market,
      legA.teamAStats!,
      legA.teamBStats!
    )

    // Check minimum correlation threshold (lower for niche markets)
    const minCorrelation = this.getMinCorrelationForMarkets(legA.market, legB.market)
    if (corrResult.finalCorrelation < minCorrelation) {
      this.logger.debug(
        `GEMELA rejected: correlation ${corrResult.finalCorrelation.toFixed(2)} < ${minCorrelation.toFixed(2)}`
      )
      return null
    }

    // Combined odds
    const combinedOdds = legA.odds * legB.odds

    // Joint probability with correlation
    const pJoint = this.correlationService.jointProbability(
      legA.probOwn,
      legB.probOwn,
      corrResult.finalCorrelation
    )

    // Independent probability (bookmaker's assumption)
    const pCasa = legA.probOwn * legB.probOwn

    // EV calculations
    const evReal = pJoint * combinedOdds - 1
    const evCasa = pCasa * combinedOdds - 1
    const hiddenEdge = evReal - evCasa

    // Build legs array
    const legs: ComboLeg[] = [legA, legB]

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

        // Determine combo type using market categories
        const catA = this.getMarketCategory(pickA.market)
        const catB = this.getMarketCategory(pickB.market)
        const sameMarketCategory = catA === catB
        const sameLeague = pickA.leagueId === pickB.leagueId

        // Skip same league (correlated by external factors)
        if (sameLeague) continue

        // CROSS_LIGA = same market, different league
        // CROSS_MERCADO = different markets, different leagues
        const comboType = sameMarketCategory
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
   * Create a TRIPLE_GEMELA combo (same match: 3 different markets)
   * High correlation same-match combo with 3 picks
   */
  createTripleGemela(
    picks: ComboLeg[],
    context?: MatchContext
  ): GeneratedCombo | null {
    if (picks.length < 3) return null

    const [legA, legB, legC] = picks

    // Calculate pairwise correlations
    const corrAB = this.correlationService.calculateDynamicCorrelation(
      { fixtureId: legA.fixtureId, leagueId: legA.leagueId } as BettingFixture,
      legA.market,
      legB.market,
      legA.teamAStats!,
      legA.teamBStats!
    )

    const corrBC = this.correlationService.calculateDynamicCorrelation(
      { fixtureId: legB.fixtureId, leagueId: legB.leagueId } as BettingFixture,
      legB.market,
      legC.market,
      legB.teamAStats!,
      legB.teamBStats!
    )

    const corrAC = this.correlationService.calculateDynamicCorrelation(
      { fixtureId: legA.fixtureId, leagueId: legA.leagueId } as BettingFixture,
      legA.market,
      legC.market,
      legA.teamAStats!,
      legA.teamBStats!
    )

    // Average correlation for the triple
    const avgCorrelation =
      (corrAB.finalCorrelation + corrBC.finalCorrelation + corrAC.finalCorrelation) / 3

    // Minimum average correlation for triple gemela
    if (avgCorrelation < 0.25) {
      this.logger.debug(
        `TRIPLE_GEMELA rejected: avg correlation ${avgCorrelation.toFixed(2)} < 0.25`
      )
      return null
    }

    // Combined odds
    const combinedOdds = legA.odds * legB.odds * legC.odds

    // Joint probability with correlation (simplified for 3 legs)
    // P(A ∩ B ∩ C) ≈ P(A) × P(B|A) × P(C|A,B)
    // Using average correlation as approximation
    const pJoint_AB = this.correlationService.jointProbability(
      legA.probOwn,
      legB.probOwn,
      corrAB.finalCorrelation
    )
    const pJoint = this.correlationService.jointProbability(
      pJoint_AB,
      legC.probOwn,
      (corrAC.finalCorrelation + corrBC.finalCorrelation) / 2
    )

    // Independent probability (bookmaker's assumption)
    const pCasa = legA.probOwn * legB.probOwn * legC.probOwn

    // EV calculations
    const evReal = pJoint * combinedOdds - 1
    const evCasa = pCasa * combinedOdds - 1
    const hiddenEdge = evReal - evCasa

    // Build legs array
    const legs: ComboLeg[] = [legA, legB, legC]

    // Calculate score
    const { score, breakdown } = this.scoreCombo(
      ComboType.TRIPLE_CORRELACIONADO,
      legs,
      evReal,
      hiddenEdge,
      avgCorrelation
    )

    // Determine time window
    const timeWindow = this.determineTimeWindow(new Date())

    // Context flags
    const contextFlags = context?.flags || []

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
      correlation: {
        base: avgCorrelation,
        dynamic: avgCorrelation,
        adjustments: [
          ...corrAB.adjustments,
          ...corrBC.adjustments,
          ...corrAC.adjustments,
        ],
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
    return (
      (m.includes('GOAL') || (m.includes('OVER') && m.includes('1H'))) &&
      !m.includes('CORNER') &&
      !m.includes('CARD') &&
      !m.includes('BTTS')
    )
  }

  private isCornersMarket(market: MarketType | string): boolean {
    const m = String(market).toUpperCase()
    return m.includes('CORNER')
  }

  private isCardsMarket(market: MarketType | string): boolean {
    const m = String(market).toUpperCase()
    return m.includes('CARD') || m.includes('TARJETA')
  }

  private isBTTSMarket(market: MarketType | string): boolean {
    const m = String(market).toUpperCase()
    return m.includes('BTTS')
  }

  private getMarketCategory(market: MarketType | string): string {
    if (this.isGoalsMarket(market)) return 'GOALS'
    if (this.isBTTSMarket(market)) return 'BTTS'
    if (this.isCornersMarket(market)) return 'CORNERS'
    if (this.isCardsMarket(market)) return 'CARDS'
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

  /**
   * Get minimum correlation threshold for market pair
   * Niche markets (Cards, BTTS) have lower thresholds since
   * bookmakers don't model their correlations as precisely
   */
  private getMinCorrelationForMarkets(
    marketA: MarketType | string,
    marketB: MarketType | string
  ): number {
    const catA = this.getMarketCategory(marketA)
    const catB = this.getMarketCategory(marketB)

    // Standard Goals + Corners combo - well-studied
    if (
      (catA === 'GOALS' && catB === 'CORNERS') ||
      (catA === 'CORNERS' && catB === 'GOALS')
    ) {
      return 0.30
    }

    // BTTS correlates well with goals
    if (
      (catA === 'GOALS' && catB === 'BTTS') ||
      (catA === 'BTTS' && catB === 'GOALS')
    ) {
      return 0.35 // Higher threshold since BTTS is essentially a goals market
    }

    // Cards are niche - lower threshold
    if (catA === 'CARDS' || catB === 'CARDS') {
      return 0.20
    }

    // BTTS + Corners - moderate correlation
    if (
      (catA === 'BTTS' && catB === 'CORNERS') ||
      (catA === 'CORNERS' && catB === 'BTTS')
    ) {
      return 0.25
    }

    // Default
    return 0.25
  }
}
