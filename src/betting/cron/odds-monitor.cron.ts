import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import { ApiFootballBettingService } from '../services/api-football-betting.service'
import { BettingTelegramService } from '../telegram/betting-telegram.service'
import { PickStatus, SteamMoveDirection } from '../enums/betting.enums'

/**
 * v1.5.0: Cross-market correlation types
 * When multiple markets align on the same fixture, it indicates higher confidence
 */
interface CrossMarketCorrelation {
  fixtureId: number
  markets: string[]
  direction: 'OVER' | 'UNDER'
  avgEdge: number
  correlationType: 'ATTACKING_GAME' | 'DEFENSIVE_GAME' | 'CHAOTIC_GAME'
  confidence: 'HIGH' | 'MEDIUM'
}

/**
 * Correlation patterns:
 * - ATTACKING_GAME: Goals Over + Corners Over align (teams push forward)
 * - DEFENSIVE_GAME: Goals Under + Corners Under align (tight tactical game)
 * - CHAOTIC_GAME: Goals Over + Cards Over align (intense, aggressive match)
 */
const CORRELATION_PATTERNS = {
  ATTACKING_GAME: ['GOALS_1H', 'CORNERS'],
  DEFENSIVE_GAME: ['GOALS_1H', 'CORNERS'],
  CHAOTIC_GAME: ['GOALS_1H', 'CARDS'],
}

/**
 * Odds Monitor Cron Job
 * Runs every 30 minutes during match windows
 *
 * Schedule:
 * - Weekend (Sat/Sun): 6 AM - 2 PM El Salvador
 * - Midweek (Tue/Wed/Thu): 10 AM - 3 PM El Salvador (Champions/Europa League)
 *
 * Purpose:
 * - Monitor odds changes for active picks
 * - Detect late steam moves
 * - Track CLV pre-match
 * - Alert on significant changes
 */
@Injectable()
export class OddsMonitorCron {
  private readonly logger = new Logger(OddsMonitorCron.name)

  // Significant change threshold (10% per documento maestro sección 4.3)
  private readonly SIGNIFICANT_CHANGE = 0.10 // 10% change = steam move

  constructor(
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    private apiFootballService: ApiFootballBettingService,
    private telegramService: BettingTelegramService
  ) {}

  /**
   * Every 30 minutes from 6 AM to 2 PM on Saturday and Sunday
   */
  @Cron('*/30 6-14 * * 6,0', {
    name: 'betting-odds-monitor-weekend',
    timeZone: 'America/El_Salvador',
  })
  async monitorOddsWeekend(): Promise<void> {
    this.logger.debug('Running weekend odds monitor...')
    await this.monitorOdds()
  }

  /**
   * Every 30 minutes from 10 AM to 3 PM on Tuesday, Wednesday, Thursday
   * (Champions League and Europa League match days)
   */
  @Cron('*/30 10-15 * * 2,3,4', {
    name: 'betting-odds-monitor-midweek',
    timeZone: 'America/El_Salvador',
  })
  async monitorOddsMidweek(): Promise<void> {
    this.logger.debug('Running midweek odds monitor...')
    await this.monitorOdds()
  }

  /**
   * Core odds monitoring logic
   */
  private async monitorOdds(): Promise<void> {
    this.logger.debug('Running odds monitor...')

    try {
      // Check if betting is active
      const settings = await this.bettingSettingsModel.findOne().exec()
      if (!settings?.isActive) {
        return
      }

      // Get active/pending picks for today
      const now = new Date()
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)

      // Only monitor picks within the next 2 hours
      const upcomingPicks = await this.bettingPickModel
        .find({
          status: { $in: [PickStatus.PENDING, PickStatus.ACTIVE] },
          kickoff: {
            $gte: now,
            $lte: twoHoursFromNow,
          },
        })
        .exec()

      if (upcomingPicks.length === 0) {
        return
      }

      this.logger.debug(`Monitoring ${upcomingPicks.length} upcoming picks`)

      for (const pick of upcomingPicks) {
        try {
          await this.checkOddsForPick(pick)
        } catch (error) {
          this.logger.error(`Error monitoring pick ${pick._id}: ${error}`)
        }
      }
    } catch (error) {
      this.logger.error(`Odds monitor failed: ${error}`)
    }
  }

  /**
   * Check odds changes for a single pick
   */
  private async checkOddsForPick(pick: BettingPickDocument): Promise<void> {
    const currentOdds = await this.apiFootballService.getOdds(pick.fixtureId)

    if (!currentOdds) {
      return
    }

    const newOdds = this.findOddsForPick(currentOdds, pick)

    if (!newOdds) {
      return
    }

    const referenceOdds = pick.oddsAtBet || pick.oddsAtDetection || 0
    if (referenceOdds === 0) {
      return
    }

    const oddsChange = (newOdds - referenceOdds) / referenceOdds

    // Detect significant late steam move
    if (
      Math.abs(oddsChange) >= this.SIGNIFICANT_CHANGE &&
      !pick.steamMove?.detected
    ) {
      const direction: SteamMoveDirection =
        oddsChange < 0
          ? SteamMoveDirection.FAVORABLE
          : SteamMoveDirection.CONTRA

      await this.bettingPickModel.updateOne(
        { _id: pick._id },
        {
          $set: {
            'steamMove.detected': true,
            'steamMove.direction': direction,
            'steamMove.pctChange': oddsChange * 100,
            'steamMove.timestamp': new Date(),
          },
        }
      )

      this.logger.log(
        `Late steam move detected: ${pick.teamHome.name} vs ${pick.teamAway.name} - ` +
          `${String(pick.market)} ${(oddsChange * 100).toFixed(1)}% (${direction})`
      )

      // Send immediate Telegram notification for steam moves
      await this.telegramService.sendSteamMoveAlert(pick, direction, oddsChange * 100)
    }

    // Calculate pre-match CLV (Closing Line Value preview)
    const probImplied = 1 / newOdds
    const newEdge = pick.probOwn - probImplied

    // Log if edge improved significantly
    if (newEdge > pick.edge + 0.02) {
      this.logger.log(
        `Edge improved for ${pick.teamHome.name} vs ${pick.teamAway.name}: ` +
          `${(pick.edge * 100).toFixed(1)}% → ${(newEdge * 100).toFixed(1)}%`
      )
    }
  }

  /**
   * Find current odds for a specific pick
   */
  private findOddsForPick(odds: any, pick: BettingPickDocument): number | null {
    if (!odds?.bookmakers) return null

    const marketStr = String(pick.market).toLowerCase()
    const isGoals = marketStr.includes('goal') || marketStr.includes('1h')
    const isCorners = marketStr.includes('corner')

    for (const bookmaker of odds.bookmakers) {
      for (const market of bookmaker.markets) {
        const marketName = market.marketName.toLowerCase()

        if (isGoals && marketName.includes('goals') && marketName.includes('half')) {
          for (const value of market.values) {
            const valueName = value.name.toLowerCase()
            if (
              valueName.includes(pick.direction.toLowerCase()) &&
              valueName.includes(String(pick.line))
            ) {
              return value.odds
            }
          }
        }

        if (isCorners && marketName.includes('corner')) {
          for (const value of market.values) {
            const valueName = value.name.toLowerCase()
            if (
              valueName.includes(pick.direction.toLowerCase()) &&
              valueName.includes(String(pick.line))
            ) {
              return value.odds
            }
          }
        }
      }
    }

    return null
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualMonitor(): Promise<{ monitored: number }> {
    this.logger.log('Manual odds monitor triggered')

    const now = new Date()
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000)

    const picks = await this.bettingPickModel
      .find({
        status: { $in: [PickStatus.PENDING, PickStatus.ACTIVE] },
        kickoff: {
          $gte: now,
          $lte: fourHoursFromNow,
        },
      })
      .exec()

    for (const pick of picks) {
      await this.checkOddsForPick(pick)
    }

    // v1.5.0: Check for cross-market correlations
    const correlations = await this.detectCrossMarketCorrelations(picks)
    if (correlations.length > 0) {
      this.logger.log(`Detected ${correlations.length} cross-market correlations`)
    }

    return { monitored: picks.length }
  }

  /**
   * v1.5.0: Detect cross-market correlations
   * When multiple markets align on the same fixture, it indicates higher confidence
   */
  private async detectCrossMarketCorrelations(
    picks: BettingPickDocument[]
  ): Promise<CrossMarketCorrelation[]> {
    const correlations: CrossMarketCorrelation[] = []

    // Group picks by fixtureId
    const picksByFixture = new Map<number, BettingPickDocument[]>()
    for (const pick of picks) {
      const existing = picksByFixture.get(pick.fixtureId) || []
      existing.push(pick)
      picksByFixture.set(pick.fixtureId, existing)
    }

    // Check each fixture for correlations
    for (const [fixtureId, fixturePicks] of picksByFixture.entries()) {
      if (fixturePicks.length < 2) continue

      const correlation = this.analyzeFixtureCorrelation(fixtureId, fixturePicks)
      if (correlation) {
        correlations.push(correlation)

        // Update picks with correlation info
        await this.bettingPickModel.updateMany(
          { fixtureId, _id: { $in: fixturePicks.map((p) => p._id) } },
          {
            $set: {
              'crossMarket.detected': true,
              'crossMarket.type': correlation.correlationType,
              'crossMarket.confidence': correlation.confidence,
              'crossMarket.markets': correlation.markets,
            },
          }
        )

        this.logger.log(
          `Cross-market correlation: Fixture ${fixtureId} - ${correlation.correlationType} ` +
            `(${correlation.markets.join(', ')}) - ${correlation.confidence} confidence`
        )
      }
    }

    return correlations
  }

  /**
   * Analyze a single fixture for market correlations
   */
  private analyzeFixtureCorrelation(
    fixtureId: number,
    picks: BettingPickDocument[]
  ): CrossMarketCorrelation | null {
    const marketMap = new Map<string, { direction: string; edge: number }>()

    for (const pick of picks) {
      const marketStr = String(pick.market).toUpperCase()
      let marketType = 'OTHER'

      if (marketStr.includes('GOAL') || marketStr.includes('1H')) {
        marketType = 'GOALS_1H'
      } else if (marketStr.includes('CORNER')) {
        marketType = 'CORNERS'
      } else if (marketStr.includes('CARD')) {
        marketType = 'CARDS'
      }

      marketMap.set(marketType, {
        direction: pick.direction,
        edge: pick.edge,
      })
    }

    // Check for ATTACKING_GAME: Goals Over + Corners Over
    const goalsData = marketMap.get('GOALS_1H')
    const cornersData = marketMap.get('CORNERS')
    const cardsData = marketMap.get('CARDS')

    if (goalsData && cornersData && goalsData.direction === cornersData.direction) {
      const avgEdge = (goalsData.edge + cornersData.edge) / 2
      const isOver = goalsData.direction === 'OVER'

      return {
        fixtureId,
        markets: ['GOALS_1H', 'CORNERS'],
        direction: goalsData.direction as 'OVER' | 'UNDER',
        avgEdge,
        correlationType: isOver ? 'ATTACKING_GAME' : 'DEFENSIVE_GAME',
        confidence: avgEdge >= 0.08 ? 'HIGH' : 'MEDIUM',
      }
    }

    // Check for CHAOTIC_GAME: Goals Over + Cards Over
    if (goalsData && cardsData && goalsData.direction === 'OVER' && cardsData.direction === 'OVER') {
      const avgEdge = (goalsData.edge + cardsData.edge) / 2

      return {
        fixtureId,
        markets: ['GOALS_1H', 'CARDS'],
        direction: 'OVER',
        avgEdge,
        correlationType: 'CHAOTIC_GAME',
        confidence: avgEdge >= 0.08 ? 'HIGH' : 'MEDIUM',
      }
    }

    return null
  }
}
