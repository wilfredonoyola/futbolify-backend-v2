import { Resolver, Query, Mutation, Args, Float, Int } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { GqlAuthGuard } from '../../auth/gql-auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { Roles } from '../../auth/roles.decorator'
import { UserRole } from '../../users/schemas/user.schema'
import {
  BettingSettings,
  BettingSettingsDocument,
} from '../schemas/betting-settings.schema'
import { BettingLeague, BettingLeagueDocument } from '../schemas/betting-league.schema'
import { BettingPick, BettingPickDocument } from '../schemas/betting-pick.schema'
import { PickStatus } from '../enums/betting.enums'
import {
  BettingSettingsOutput,
  BettingSettingsInput,
  ThresholdsConfig,
  StakesConfig,
  AntiTiltConfig,
  ActiveLeagueInfo,
  ScanResult,
  ApiQuotaOutput,
  AllApisStatusOutput,
  ApiServiceStatus,
} from '../dto/betting.dto'
import { NightlyAnalysisCron } from '../cron/nightly-analysis.cron'
import { ApiFootballBettingService } from '../services/api-football-betting.service'
import { OddsApiService } from '../services/odds-api.service'
import { OpenMeteoService } from '../services/open-meteo.service'

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BettingSettingsResolver {
  constructor(
    @InjectModel(BettingSettings.name)
    private bettingSettingsModel: Model<BettingSettingsDocument>,
    @InjectModel(BettingLeague.name)
    private bettingLeagueModel: Model<BettingLeagueDocument>,
    @InjectModel(BettingPick.name)
    private bettingPickModel: Model<BettingPickDocument>,
    private nightlyAnalysisCron: NightlyAnalysisCron,
    private apiFootballService: ApiFootballBettingService,
    private oddsApiService: OddsApiService,
    private openMeteoService: OpenMeteoService
  ) {}

  @Query(() => BettingSettingsOutput, { name: 'bettingSettings' })
  async getBettingSettings(): Promise<BettingSettingsOutput> {
    let settings = await this.bettingSettingsModel.findOne().exec()

    // Create default settings if none exist
    if (!settings) {
      settings = await this.bettingSettingsModel.create({
        bankroll: 100,
        isActive: true,
        telegramAlertsOn: true,
        thresholds: {
          minEdge: 0.05,
          minComboEV: 0.05,
          minScore: 40,
          minGamesPlayed: 8,
        },
        stakes: {
          kellyFraction: 0.2,
          maxStakeIndividualPct: 0.03,
          maxStakeComboPct: 0.02,
          maxDailyExposurePct: 0.15,
          maxPicksPerDay: 5,
          maxCombosPerDay: 3,
        },
        antiTilt: {
          stopLossDailyPct: 0.1,
          maxConsecutiveLosses: 7,
        },
      })
    }

    // Get active leagues
    const activeLeagues = await this.bettingLeagueModel
      .find({ isActive: true })
      .sort({ tier: 1, name: 1 })
      .exec()

    return this.mapSettingsToOutput(settings, activeLeagues)
  }

  @Mutation(() => BettingSettingsOutput, { name: 'updateBettingSettings' })
  async updateBettingSettings(
    @Args('input') input: BettingSettingsInput
  ): Promise<BettingSettingsOutput> {
    const updateData: Record<string, unknown> = {}

    if (input.bankroll !== undefined) updateData.bankroll = input.bankroll
    if (input.isActive !== undefined) updateData.isActive = input.isActive
    if (input.telegramAlertsOn !== undefined)
      updateData.telegramAlertsOn = input.telegramAlertsOn
    if (input.timezone !== undefined) updateData.timezone = input.timezone

    // Thresholds
    if (input.minEdge !== undefined) updateData['thresholds.minEdge'] = input.minEdge
    if (input.minComboEV !== undefined)
      updateData['thresholds.minComboEV'] = input.minComboEV
    if (input.minScore !== undefined) updateData['thresholds.minScore'] = input.minScore

    // Stakes
    if (input.kellyFraction !== undefined)
      updateData['stakes.kellyFraction'] = input.kellyFraction
    if (input.fixedStake !== undefined)
      updateData['stakes.fixedStake'] = input.fixedStake
    if (input.useFixedStake !== undefined)
      updateData['stakes.useFixedStake'] = input.useFixedStake
    if (input.maxStakeIndividualPct !== undefined)
      updateData['stakes.maxStakeIndividualPct'] = input.maxStakeIndividualPct
    if (input.maxStakeComboPct !== undefined)
      updateData['stakes.maxStakeComboPct'] = input.maxStakeComboPct
    if (input.maxDailyExposurePct !== undefined)
      updateData['stakes.maxDailyExposurePct'] = input.maxDailyExposurePct
    if (input.maxPicksPerDay !== undefined)
      updateData['stakes.maxPicksPerDay'] = input.maxPicksPerDay
    if (input.maxCombosPerDay !== undefined)
      updateData['stakes.maxCombosPerDay'] = input.maxCombosPerDay

    // Anti-tilt
    if (input.stopLossDailyPct !== undefined)
      updateData['antiTilt.stopLossDailyPct'] = input.stopLossDailyPct
    if (input.maxConsecutiveLosses !== undefined)
      updateData['antiTilt.maxConsecutiveLosses'] = input.maxConsecutiveLosses

    updateData.updatedAt = new Date()

    const settings = await this.bettingSettingsModel
      .findOneAndUpdate({}, { $set: updateData }, { new: true, upsert: true })
      .exec()

    const activeLeagues = await this.bettingLeagueModel
      .find({ isActive: true })
      .sort({ tier: 1, name: 1 })
      .exec()

    return this.mapSettingsToOutput(settings!, activeLeagues)
  }

  @Mutation(() => BettingSettingsOutput, { name: 'updateBankroll' })
  async updateBankroll(
    @Args('amount', { type: () => Float }) amount: number
  ): Promise<BettingSettingsOutput> {
    const settings = await this.bettingSettingsModel
      .findOneAndUpdate(
        {},
        { $set: { bankroll: amount, updatedAt: new Date() } },
        { new: true }
      )
      .exec()

    if (!settings) {
      throw new Error('Settings not found')
    }

    const activeLeagues = await this.bettingLeagueModel
      .find({ isActive: true })
      .sort({ tier: 1, name: 1 })
      .exec()

    return this.mapSettingsToOutput(settings, activeLeagues)
  }

  @Mutation(() => BettingSettingsOutput, { name: 'toggleBettingActive' })
  async toggleBettingActive(
    @Args('active') active: boolean
  ): Promise<BettingSettingsOutput> {
    const settings = await this.bettingSettingsModel
      .findOneAndUpdate(
        {},
        { $set: { isActive: active, updatedAt: new Date() } },
        { new: true }
      )
      .exec()

    if (!settings) {
      throw new Error('Settings not found')
    }

    const activeLeagues = await this.bettingLeagueModel
      .find({ isActive: true })
      .sort({ tier: 1, name: 1 })
      .exec()

    return this.mapSettingsToOutput(settings, activeLeagues)
  }

  @Mutation(() => BettingSettingsOutput, { name: 'toggleLeague' })
  async toggleLeague(
    @Args('leagueId', { type: () => Int }) leagueId: number,
    @Args('active') active: boolean
  ): Promise<BettingSettingsOutput> {
    await this.bettingLeagueModel.updateOne(
      { apiFootballId: leagueId },
      { $set: { isActive: active } }
    )

    const settings = await this.bettingSettingsModel.findOne().exec()
    if (!settings) {
      throw new Error('Settings not found')
    }

    const activeLeagues = await this.bettingLeagueModel
      .find({ isActive: true })
      .sort({ tier: 1, name: 1 })
      .exec()

    return this.mapSettingsToOutput(settings, activeLeagues)
  }

  @Mutation(() => ScanResult, { name: 'forceScan' })
  async forceScan(@Args('date') date: string): Promise<ScanResult> {
    const result = await this.nightlyAnalysisCron.triggerManualAnalysis()

    return {
      fixturesAnalyzed: result.leagues,
      picksGenerated: result.picks,
      combosGenerated: result.combos,
      leagues: [],
    }
  }

  @Mutation(() => BettingSettingsOutput, {
    name: 'recalculateBankroll',
    description: 'Recalculate bankroll from initial amount plus all profits from betPlaced picks',
  })
  async recalculateBankroll(
    @Args('initialBankroll', { type: () => Float, description: 'Your starting bankroll amount' })
    initialBankroll: number
  ): Promise<BettingSettingsOutput> {
    // Get all resolved picks where user actually bet
    const betPlacedPicks = await this.bettingPickModel
      .find({
        betPlaced: true,
        status: { $in: [PickStatus.WON, PickStatus.LOST] },
      })
      .exec()

    // Sum all profits
    const totalProfit = betPlacedPicks.reduce((sum, pick) => sum + (pick.profit || 0), 0)

    // Calculate new bankroll
    const newBankroll = initialBankroll + totalProfit

    // Update settings
    const settings = await this.bettingSettingsModel
      .findOneAndUpdate(
        {},
        { $set: { bankroll: newBankroll, updatedAt: new Date() } },
        { new: true }
      )
      .exec()

    if (!settings) {
      throw new Error('Settings not found')
    }

    const activeLeagues = await this.bettingLeagueModel
      .find({ isActive: true })
      .sort({ tier: 1, name: 1 })
      .exec()

    return this.mapSettingsToOutput(settings, activeLeagues)
  }

  @Query(() => ApiQuotaOutput, {
    name: 'apiQuota',
    description: 'Get API-Football quota status and usage'
  })
  async getApiQuota(): Promise<ApiQuotaOutput> {
    const quota = await this.apiFootballService.getQuotaStatus()

    if (!quota) {
      return {
        account: 'unknown',
        subscription: {
          plan: 'unknown',
          end: 'unknown',
          active: false,
        },
        requests: {
          current: 0,
          limit_day: 0,
        },
        usagePercent: 0,
        remaining: 0,
        error: 'API key not configured or API unavailable',
      }
    }

    if (quota.error) {
      return {
        account: quota.account,
        subscription: quota.subscription,
        requests: quota.requests,
        usagePercent: 100,
        remaining: 0,
        error: quota.error,
      }
    }

    const usagePercent = quota.requests.limit_day > 0
      ? (quota.requests.current / quota.requests.limit_day) * 100
      : 0
    const remaining = Math.max(0, quota.requests.limit_day - quota.requests.current)

    let warning: string | undefined
    if (usagePercent >= 90) {
      warning = '⚠️ Quota crítica: menos del 10% restante'
    } else if (usagePercent >= 75) {
      warning = '⚠️ Quota baja: menos del 25% restante'
    }

    return {
      account: quota.account,
      subscription: quota.subscription,
      requests: quota.requests,
      usagePercent: Math.round(usagePercent * 10) / 10,
      remaining,
      warning,
    }
  }

  @Query(() => AllApisStatusOutput, {
    name: 'allApisStatus',
    description: 'Get status of all API services used by betting system'
  })
  async getAllApisStatus(): Promise<AllApisStatusOutput> {
    const warnings: string[] = []

    // Check API-Football
    const apiFootballQuota = await this.apiFootballService.getQuotaStatus()
    const apiFootball: ApiServiceStatus = {
      name: 'API-Football',
      configured: !!apiFootballQuota,
      available: apiFootballQuota ? !apiFootballQuota.error : false,
      requestsUsed: apiFootballQuota?.requests.current,
      requestsLimit: apiFootballQuota?.requests.limit_day,
      usagePercent: apiFootballQuota?.requests.limit_day
        ? (apiFootballQuota.requests.current / apiFootballQuota.requests.limit_day) * 100
        : undefined,
      plan: apiFootballQuota?.subscription.plan,
      message: apiFootballQuota?.error,
    }

    if (apiFootballQuota?.error) {
      warnings.push(`API-Football: ${apiFootballQuota.error}`)
    } else if (apiFootball.usagePercent && apiFootball.usagePercent >= 90) {
      warnings.push('API-Football: Quota crítica (>90%)')
    }

    // Check The Odds API
    const oddsApiStatus = await this.oddsApiService.getApiStatus()
    const theOddsApi: ApiServiceStatus = {
      name: 'The Odds API',
      configured: oddsApiStatus.configured,
      available: oddsApiStatus.available,
      requestsUsed: oddsApiStatus.requestsUsed,
      requestsLimit: oddsApiStatus.requestsRemaining !== undefined
        ? (oddsApiStatus.requestsUsed || 0) + oddsApiStatus.requestsRemaining
        : undefined,
      usagePercent: oddsApiStatus.requestsRemaining !== undefined && oddsApiStatus.requestsUsed !== undefined
        ? (oddsApiStatus.requestsUsed / ((oddsApiStatus.requestsUsed || 0) + oddsApiStatus.requestsRemaining)) * 100
        : undefined,
      message: oddsApiStatus.message,
    }

    if (!oddsApiStatus.configured) {
      warnings.push('The Odds API: No configurada (ODDS_API_KEY)')
    } else if (!oddsApiStatus.available) {
      warnings.push(`The Odds API: ${oddsApiStatus.message}`)
    }

    // Check Open-Meteo
    const openMeteoStatus = await this.openMeteoService.getApiStatus()
    const openMeteo: ApiServiceStatus = {
      name: 'Open-Meteo',
      configured: true, // No key needed
      available: openMeteoStatus.available,
      plan: 'Free (no key required)',
      message: openMeteoStatus.message,
    }

    if (!openMeteoStatus.available) {
      warnings.push(`Open-Meteo: ${openMeteoStatus.message}`)
    }

    return {
      apiFootball,
      theOddsApi,
      openMeteo,
      allOperational: apiFootball.available && theOddsApi.available && openMeteo.available,
      warnings,
    }
  }

  private mapSettingsToOutput(
    settings: BettingSettingsDocument,
    activeLeagues: BettingLeagueDocument[]
  ): BettingSettingsOutput {
    return {
      id: settings._id.toString(),
      bankroll: settings.bankroll,
      isActive: settings.isActive,
      telegramAlertsOn: settings.telegramAlertsOn,
      timezone: settings.timezone || 'UTC',
      thresholds: {
        minEdge: settings.thresholds?.minEdge || 0.05,
        minComboEV: settings.thresholds?.minComboEV || 0.05,
        minScore: settings.thresholds?.minScore || 40,
        minGamesPlayed: settings.thresholds?.minGamesPlayed || 8,
      } as ThresholdsConfig,
      stakes: {
        kellyFraction: settings.stakes?.kellyFraction || 0.2,
        fixedStake: settings.stakes?.fixedStake,
        useFixedStake: settings.stakes?.useFixedStake || false,
        maxStakeIndividualPct: settings.stakes?.maxStakeIndividualPct || 0.03,
        maxStakeComboPct: settings.stakes?.maxStakeComboPct || 0.02,
        maxDailyExposurePct: settings.stakes?.maxDailyExposurePct || 0.15,
        maxPicksPerDay: settings.stakes?.maxPicksPerDay || 5,
        maxCombosPerDay: settings.stakes?.maxCombosPerDay || 3,
      } as StakesConfig,
      antiTilt: {
        stopLossDailyPct: settings.antiTilt?.stopLossDailyPct || 0.1,
        maxConsecutiveLosses: settings.antiTilt?.maxConsecutiveLosses || 7,
      } as AntiTiltConfig,
      activeLeagues: activeLeagues.map(
        (league): ActiveLeagueInfo => ({
          id: league.apiFootballId,
          name: league.name,
          tier: league.tier,
          isActive: league.isActive,
        })
      ),
    }
  }
}
