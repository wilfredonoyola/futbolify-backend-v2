import {
  ObjectType,
  Field,
  Int,
  Float,
  InputType,
  registerEnumType,
} from '@nestjs/graphql'
import {
  PickStatus,
  ComboStatus,
  ComboType,
  MarketType,
  MarketDirection,
  TimeWindow,
  SteamMoveDirection,
  ComboScoreLevel,
} from '../enums/betting.enums'

// Re-export enums for GraphQL (already registered in enums file)

// ============ PICK TYPES ============

@ObjectType()
export class LeagueInfo {
  @Field(() => Int)
  id: number

  @Field()
  name: string

  @Field()
  country: string

  @Field(() => Int)
  tier: number
}

@ObjectType()
export class BettingTeamInfo {
  @Field(() => Int)
  id: number

  @Field()
  name: string
}

@ObjectType()
export class SteamMoveInfo {
  @Field()
  detected: boolean

  @Field(() => SteamMoveDirection, { nullable: true })
  direction?: SteamMoveDirection

  @Field(() => Float, { nullable: true })
  pctChange?: number

  @Field({ nullable: true })
  timestamp?: Date
}

@ObjectType({ description: 'Statistics for a single team used in model calculations' })
export class TeamStatsInput {
  @Field({ description: 'Team name' })
  name: string

  @Field(() => Float, { nullable: true, description: 'Average corners won per match' })
  cornersForAvg?: number

  @Field(() => Float, { nullable: true, description: 'Average corners conceded per match' })
  cornersAgainstAvg?: number

  @Field(() => Int, { nullable: true, description: 'Number of matches played (sample size)' })
  gamesPlayed?: number

  @Field(() => Float, { nullable: true, description: 'Average goals scored in first half' })
  avgGoals1H?: number

  @Field(() => Float, { nullable: true, description: 'Average goals conceded in first half' })
  avgConceded1H?: number

  @Field(() => Float, { nullable: true, description: 'Percentage of matches with Over 0.5 1H' })
  over05_1h_pct?: number

  @Field({ nullable: true, description: 'Data quality indicator (real or estimated)' })
  dataQuality?: string

  // Cards stats
  @Field(() => Float, { nullable: true, description: 'Average total cards per match' })
  avgCardsTotal?: number

  @Field(() => Float, { nullable: true, description: 'Average cards when playing at home' })
  homeCardsTotal?: number

  @Field(() => Float, { nullable: true, description: 'Average cards when playing away' })
  awayCardsTotal?: number

  @Field(() => Float, { nullable: true, description: 'Average cards in last 5 matches (form)' })
  formCards5?: number
}

@ObjectType({ description: 'Model inputs and data sources used for pick calculation' })
export class ModelInputs {
  @Field({ nullable: true, description: 'Data source used for stats (e.g., API-Football)' })
  dataSource?: string

  @Field(() => Float, { nullable: true })
  probBase?: number

  @Field(() => Float, { nullable: true })
  formAdjustment?: number

  @Field(() => Float, { nullable: true })
  h2hAdjustment?: number

  @Field(() => Float, { nullable: true })
  leagueAdjustment?: number

  @Field(() => Float, { nullable: true })
  contextMultiplier?: number

  @Field(() => [String], { nullable: true, description: 'Context flags applied (e.g., DERBY, TOP_CLASH)' })
  contextFlags?: string[]

  // Team stats for admin detail view
  @Field(() => TeamStatsInput, { nullable: true, description: 'Home team statistics used in calculation' })
  teamAStats?: TeamStatsInput

  @Field(() => TeamStatsInput, { nullable: true, description: 'Away team statistics used in calculation' })
  teamBStats?: TeamStatsInput

  // Goals 1H specific
  @Field(() => Float, { nullable: true, description: 'Expected goals in first half' })
  expectedGoals1H?: number

  // Corners specific
  @Field(() => Float, { nullable: true, description: 'Expected total corners in match' })
  cornersExpected?: number

  @Field(() => Float, { nullable: true, description: 'Expected corners in first half' })
  cornersExpected1H?: number

  // Cards specific
  @Field(() => Float, { nullable: true, description: 'Expected total cards in match' })
  cardsExpected?: number

  @Field(() => Float, { nullable: true, description: 'Expected cards in first half' })
  cardsExpected1H?: number

  // Corners handicap specific
  @Field(() => Float, { nullable: true, description: 'Handicap line calculated by our model (positive = home advantage)' })
  handicapLineExpected?: number

  @Field(() => Float, { nullable: true, description: 'Handicap line offered by bookmaker' })
  handicapLineBookmaker?: number

  // Calculation explanation
  @Field({ nullable: true, description: 'Human-readable explanation of how the model calculated this pick' })
  calculationExplanation?: string

  // Weather data
  @Field({ nullable: true, description: 'Weather description at match time' })
  weatherDescription?: string

  @Field(() => Float, { nullable: true, description: 'Temperature in Celsius' })
  weatherTemp?: number

  @Field(() => Float, { nullable: true, description: 'Wind speed in km/h' })
  weatherWind?: number

  @Field(() => Float, { nullable: true, description: 'Precipitation in mm' })
  weatherPrecip?: number

  @Field(() => [String], { nullable: true, description: 'Weather flags applied (RAIN, WINDY, etc.)' })
  weatherFlags?: string[]
}

@ObjectType()
export class MatchResult {
  @Field({ nullable: true })
  scoreHT?: string

  @Field({ nullable: true })
  scoreFT?: string

  @Field(() => Int, { nullable: true })
  cornersTotal?: number

  @Field(() => Int, { nullable: true })
  cornersHT?: number

  @Field(() => Int, { nullable: true })
  cornersHome?: number

  @Field(() => Int, { nullable: true })
  cornersAway?: number

  // Cards
  @Field(() => Int, { nullable: true })
  cardsTotal?: number

  @Field(() => Int, { nullable: true })
  cardsHT?: number

  @Field(() => Int, { nullable: true })
  cardsHome?: number

  @Field(() => Int, { nullable: true })
  cardsAway?: number
}

@ObjectType()
export class BettingPickOutput {
  @Field()
  id: string

  @Field(() => Int)
  fixtureId: number

  @Field()
  date: Date

  @Field(() => LeagueInfo)
  league: LeagueInfo

  @Field(() => BettingTeamInfo)
  teamHome: BettingTeamInfo

  @Field(() => BettingTeamInfo)
  teamAway: BettingTeamInfo

  @Field()
  kickoff: Date

  @Field(() => TimeWindow, { nullable: true })
  timeWindow?: TimeWindow

  @Field(() => MarketType)
  market: MarketType

  @Field({ description: 'Human-readable market label' })
  marketLabel: string

  @Field(() => MarketDirection)
  direction: MarketDirection

  @Field(() => Float)
  line: number

  @Field(() => Float)
  probOwn: number

  @Field(() => Float)
  probImplied: number

  @Field(() => Float)
  edge: number

  @Field(() => Int)
  confidenceScore: number

  @Field(() => ModelInputs, { nullable: true })
  modelInputs?: ModelInputs

  @Field(() => [String], { nullable: true, description: 'Human-readable reasons for this pick' })
  reasons?: string[]

  @Field(() => Int, { nullable: true, description: 'Star rating 1-5 based on edge' })
  stars?: number

  @Field(() => Float)
  oddsAtDetection: number

  @Field(() => Float, { nullable: true })
  oddsAtBet?: number

  @Field(() => Float, { nullable: true })
  oddsAtClose?: number

  @Field({ nullable: true })
  bestBookmaker?: string

  @Field(() => SteamMoveInfo, { nullable: true })
  steamMove?: SteamMoveInfo

  @Field(() => PickStatus)
  status: PickStatus

  @Field(() => Float, { nullable: true })
  stake?: number

  @Field(() => Float, { nullable: true })
  profit?: number

  @Field(() => Float, { nullable: true })
  clv?: number

  @Field(() => MatchResult, { nullable: true })
  matchResult?: MatchResult

  // Bet tracking fields
  @Field({ description: 'Whether the user actually placed this bet' })
  betPlaced: boolean

  @Field({ nullable: true, description: 'When the bet was marked as placed' })
  betPlacedAt?: Date

  @Field(() => Float, { nullable: true, description: 'Amount actually wagered by user' })
  betAmount?: number

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

// ============ COMBO TYPES ============

@ObjectType()
export class ComboLegOutput {
  @Field({ nullable: true })
  pickId?: string

  @Field(() => Int)
  fixtureId: number

  @Field(() => MarketType)
  market: MarketType

  @Field(() => MarketDirection)
  direction: MarketDirection

  @Field(() => Float)
  odds: number

  @Field(() => Float)
  probOwn: number

  @Field(() => PickStatus, { nullable: true })
  result?: PickStatus

  @Field({ nullable: true })
  teamHome?: string

  @Field({ nullable: true })
  teamAway?: string
}

@ObjectType()
export class CorrelationInfo {
  @Field(() => Float)
  base: number

  @Field(() => Float)
  dynamic: number

  @Field(() => [CorrelationAdjustment], { nullable: true })
  adjustments?: CorrelationAdjustment[]
}

@ObjectType()
export class CorrelationAdjustment {
  @Field()
  factor: string

  @Field(() => Float)
  value: number
}

@ObjectType()
export class ScoreBreakdown {
  @Field(() => Float)
  evPoints: number

  @Field(() => Float)
  correlationPoints: number

  @Field(() => Float)
  confidencePoints: number

  @Field(() => Float)
  steamPoints: number

  @Field(() => Float)
  diversificationPoints: number

  @Field(() => Float)
  penalties: number
}

@ObjectType()
export class BettingComboOutput {
  @Field()
  id: string

  @Field()
  date: Date

  @Field(() => ComboType)
  type: ComboType

  @Field()
  sharpConfirmed: boolean

  @Field(() => [ComboLegOutput])
  legs: ComboLegOutput[]

  @Field(() => CorrelationInfo, { nullable: true })
  correlation?: CorrelationInfo

  @Field(() => Float)
  pCasa: number

  @Field(() => Float)
  pReal: number

  @Field(() => Float)
  hiddenEdge: number

  @Field(() => Float)
  combinedOdds: number

  @Field(() => Float)
  evReal: number

  @Field(() => Int)
  score: number

  @Field(() => ComboScoreLevel)
  scoreLevel: ComboScoreLevel

  @Field(() => ScoreBreakdown, { nullable: true })
  scoreBreakdown?: ScoreBreakdown

  @Field(() => ComboStatus)
  status: ComboStatus

  @Field(() => Float, { nullable: true })
  stake?: number

  @Field(() => Float, { nullable: true })
  profit?: number

  @Field(() => TimeWindow, { nullable: true })
  timeWindow?: TimeWindow

  @Field(() => [String], { nullable: true })
  warnings?: string[]

  @Field()
  createdAt: Date

  @Field()
  updatedAt: Date
}

// ============ DASHBOARD TYPES ============

@ObjectType()
export class BettingDashboard {
  @Field(() => Float)
  bankroll: number

  @Field(() => Float)
  roi: number

  @Field(() => Float)
  avgCLV: number

  @Field(() => Int)
  currentStreak: number

  @Field(() => Int)
  maxStreak: number

  @Field(() => Int)
  totalBets: number

  @Field(() => [BettingPickOutput])
  todayPicks: BettingPickOutput[]

  @Field(() => [BettingComboOutput])
  todayCombos: BettingComboOutput[]

  @Field(() => [BettingPickOutput])
  recentResults: BettingPickOutput[]

  @Field(() => Float)
  todayExposure: number
}

// ============ ANALYTICS TYPES ============

@ObjectType()
export class BettingAnalytics {
  @Field(() => Int)
  totalBets: number

  @Field(() => Float)
  winRate: number

  @Field(() => Float)
  roi: number

  @Field(() => Float)
  avgCLV: number

  @Field(() => Float)
  sharpeRatio: number

  @Field(() => Float)
  maxDrawdown: number

  @Field(() => Float)
  totalProfit: number

  @Field(() => Float)
  bestDay: number

  @Field(() => Float)
  worstDay: number
}

// ============ CREDIBILITY DASHBOARD TYPES ============

@ObjectType({ description: 'Statistics for system or personal betting performance' })
export class CredibilityStats {
  @Field(() => Float, { description: 'Win rate as decimal (0.67 = 67%)' })
  winRate: number

  @Field(() => Float, { description: 'Return on investment as decimal' })
  roi: number

  @Field(() => Float, { description: 'Total profit/loss in currency' })
  totalProfit: number

  @Field(() => Int, { description: 'Total number of picks' })
  totalPicks: number

  @Field(() => Int, { description: 'Number of winning picks' })
  wins: number

  @Field(() => Int, { description: 'Number of losing picks' })
  losses: number

  @Field(() => Float, { description: 'Total amount staked' })
  totalStaked: number
}

@ObjectType({ description: 'Dashboard comparing system picks vs personally bet picks' })
export class CredibilityDashboard {
  @Field(() => CredibilityStats, { description: 'Stats for ALL system-generated picks' })
  systemStats: CredibilityStats

  @Field(() => CredibilityStats, { description: 'Stats for only picks where betPlaced=true' })
  personalStats: CredibilityStats

  @Field(() => Float, { description: 'Current personal bankroll' })
  personalBankroll: number

  @Field(() => Float, { description: 'Personal bankroll change today' })
  todayProfit: number

  @Field(() => Int, { description: 'Current winning streak for personal bets' })
  personalStreak: number
}

@ObjectType()
export class LeaguePerformance {
  @Field(() => Int)
  leagueId: number

  @Field()
  leagueName: string

  @Field(() => Int)
  bets: number

  @Field(() => Float)
  winRate: number

  @Field(() => Float)
  roi: number

  @Field(() => Float)
  avgCLV: number

  @Field(() => Float)
  profit: number
}

@ObjectType()
export class MarketPerformance {
  @Field(() => MarketType)
  market: MarketType

  @Field({ description: 'Human-readable market label' })
  marketLabel: string

  @Field(() => Int)
  bets: number

  @Field(() => Float)
  winRate: number

  @Field(() => Float)
  roi: number

  @Field(() => Float)
  avgCLV: number

  @Field(() => Float)
  profit: number
}

@ObjectType()
export class ComboTypePerformance {
  @Field(() => ComboType)
  type: ComboType

  @Field(() => Int)
  count: number

  @Field(() => Float)
  winRate: number

  @Field(() => Float)
  roi: number

  @Field(() => Float)
  avgEV: number

  @Field(() => Float)
  avgHiddenEdge: number

  @Field(() => Float)
  profit: number
}

@ObjectType()
export class BankrollDataPoint {
  @Field()
  date: Date

  @Field(() => Float)
  value: number

  @Field(() => Float)
  dailyProfit: number
}

@ObjectType()
export class CLVDataPoint {
  @Field()
  date: Date

  @Field(() => Float)
  clv: number

  @Field(() => PickStatus)
  result: PickStatus
}

// ============ SETTINGS TYPES ============

@ObjectType()
export class ThresholdsConfig {
  @Field(() => Float)
  minEdge: number

  @Field(() => Float)
  minComboEV: number

  @Field(() => Int)
  minScore: number

  @Field(() => Int)
  minGamesPlayed: number
}

@ObjectType()
export class StakesConfig {
  @Field(() => Float)
  kellyFraction: number

  @Field(() => Float, { nullable: true, description: 'Fixed stake amount in dollars' })
  fixedStake?: number

  @Field({ description: 'Use fixed stake instead of Kelly calculation' })
  useFixedStake: boolean

  @Field(() => Float)
  maxStakeIndividualPct: number

  @Field(() => Float)
  maxStakeComboPct: number

  @Field(() => Float)
  maxDailyExposurePct: number

  @Field(() => Int)
  maxPicksPerDay: number

  @Field(() => Int)
  maxCombosPerDay: number
}

@ObjectType()
export class AntiTiltConfig {
  @Field(() => Float)
  stopLossDailyPct: number

  @Field(() => Int)
  maxConsecutiveLosses: number
}

@ObjectType()
export class ActiveLeagueInfo {
  @Field(() => Int)
  id: number

  @Field()
  name: string

  @Field(() => Int)
  tier: number

  @Field()
  isActive: boolean
}

@ObjectType()
export class BettingSettingsOutput {
  @Field()
  id: string

  @Field(() => Float)
  bankroll: number

  @Field()
  isActive: boolean

  @Field()
  telegramAlertsOn: boolean

  @Field({ nullable: true, description: 'User timezone in IANA format' })
  timezone?: string

  @Field(() => ThresholdsConfig)
  thresholds: ThresholdsConfig

  @Field(() => StakesConfig)
  stakes: StakesConfig

  @Field(() => AntiTiltConfig)
  antiTilt: AntiTiltConfig

  @Field(() => [ActiveLeagueInfo])
  activeLeagues: ActiveLeagueInfo[]
}

// ============ LEAGUE TYPES ============

@ObjectType()
export class BettingLeagueOutput {
  @Field()
  id: string

  @Field(() => Int)
  apiFootballId: number

  @Field()
  name: string

  @Field()
  country: string

  @Field({ nullable: true })
  logo?: string

  @Field(() => Int)
  tier: number

  @Field()
  isActive: boolean

  @Field({ nullable: true })
  season?: string

  @Field(() => Int, { nullable: true })
  fixturesAnalyzed?: number

  @Field(() => Int, { nullable: true })
  picksGenerated?: number

  @Field(() => [String], { nullable: true, description: 'Markets this league is strong for: goals_1h, corners, btts, sharps, over25' })
  marketStrengths?: string[]

  @Field({ nullable: true, description: 'Additional notes about the league' })
  notes?: string
}

// ============ INPUT TYPES ============

@InputType()
export class PickFiltersInput {
  @Field({ nullable: true })
  dateFrom?: string

  @Field({ nullable: true })
  dateTo?: string

  @Field(() => Int, { nullable: true })
  leagueId?: number

  @Field(() => MarketType, { nullable: true })
  market?: MarketType

  @Field(() => PickStatus, { nullable: true })
  status?: PickStatus

  @Field(() => Int, { nullable: true })
  minConfidence?: number

  @Field({ nullable: true, description: 'Filter by betPlaced status (true = only bets I placed)' })
  betPlaced?: boolean

  @Field(() => Int, { nullable: true })
  limit?: number

  @Field(() => Int, { nullable: true })
  offset?: number
}

@InputType()
export class ComboFiltersInput {
  @Field({ nullable: true })
  dateFrom?: string

  @Field({ nullable: true })
  dateTo?: string

  @Field(() => ComboType, { nullable: true })
  type?: ComboType

  @Field(() => ComboStatus, { nullable: true })
  status?: ComboStatus

  @Field(() => Int, { nullable: true })
  limit?: number

  @Field(() => Int, { nullable: true })
  offset?: number
}

@InputType()
export class BettingSettingsInput {
  @Field(() => Float, { nullable: true })
  bankroll?: number

  @Field({ nullable: true })
  isActive?: boolean

  @Field({ nullable: true })
  telegramAlertsOn?: boolean

  @Field({ nullable: true, description: 'User timezone in IANA format (e.g., America/El_Salvador)' })
  timezone?: string

  @Field(() => Float, { nullable: true })
  minEdge?: number

  @Field(() => Float, { nullable: true })
  minComboEV?: number

  @Field(() => Int, { nullable: true })
  minScore?: number

  @Field(() => Float, { nullable: true })
  kellyFraction?: number

  @Field(() => Float, { nullable: true, description: 'Fixed stake amount in dollars' })
  fixedStake?: number

  @Field({ nullable: true, description: 'Use fixed stake instead of Kelly calculation' })
  useFixedStake?: boolean

  @Field(() => Float, { nullable: true })
  maxStakeIndividualPct?: number

  @Field(() => Float, { nullable: true })
  maxStakeComboPct?: number

  @Field(() => Float, { nullable: true })
  maxDailyExposurePct?: number

  @Field(() => Int, { nullable: true })
  maxPicksPerDay?: number

  @Field(() => Int, { nullable: true })
  maxCombosPerDay?: number

  @Field(() => Float, { nullable: true })
  stopLossDailyPct?: number

  @Field(() => Int, { nullable: true })
  maxConsecutiveLosses?: number
}

// ============ RESULT ENUMS FOR MUTATIONS ============

export enum PickResult {
  WON = 'WON',
  LOST = 'LOST',
  VOID = 'VOID',
}

registerEnumType(PickResult, {
  name: 'PickResult',
  description: 'Result of a pick for manual registration',
})

export enum ComboResult {
  WON = 'WON',
  LOST = 'LOST',
  PARTIAL = 'PARTIAL',
  CANCELLED = 'CANCELLED',
}

registerEnumType(ComboResult, {
  name: 'ComboResult',
  description: 'Result of a combo for manual registration',
})

// ============ MUTATION RESULTS ============

@ObjectType()
export class ScanResult {
  @Field(() => Int)
  fixturesAnalyzed: number

  @Field(() => Int)
  picksGenerated: number

  @Field(() => Int)
  combosGenerated: number

  @Field(() => [String])
  leagues: string[]
}

// ============ API QUOTA TYPES ============

@ObjectType({ description: 'API Football subscription information' })
export class ApiSubscription {
  @Field({ description: 'Subscription plan name' })
  plan: string

  @Field({ description: 'End date of current subscription' })
  end: string

  @Field({ description: 'Whether subscription is active' })
  active: boolean
}

@ObjectType({ description: 'API Football request quota information' })
export class ApiQuotaRequests {
  @Field(() => Int, { description: 'Current number of requests used today' })
  current: number

  @Field(() => Int, { description: 'Maximum daily requests allowed' })
  limit_day: number
}

@ObjectType({ description: 'API Football quota status' })
export class ApiQuotaOutput {
  @Field({ description: 'Account email or identifier' })
  account: string

  @Field(() => ApiSubscription, { description: 'Subscription details' })
  subscription: ApiSubscription

  @Field(() => ApiQuotaRequests, { description: 'Request quota information' })
  requests: ApiQuotaRequests

  @Field(() => Float, { description: 'Percentage of daily quota used (0-100)' })
  usagePercent: number

  @Field(() => Int, { description: 'Remaining requests for today' })
  remaining: number

  @Field({ description: 'Warning message if quota is low', nullable: true })
  warning?: string

  @Field({ description: 'Error message if quota check failed', nullable: true })
  error?: string
}

// ============ ALL APIS STATUS ============

@ObjectType({ description: 'Status of a single API service' })
export class ApiServiceStatus {
  @Field({ description: 'Name of the API service' })
  name: string

  @Field({ description: 'Whether API key is configured' })
  configured: boolean

  @Field({ description: 'Whether the API is currently available' })
  available: boolean

  @Field(() => Int, { nullable: true, description: 'Requests used today' })
  requestsUsed?: number

  @Field(() => Int, { nullable: true, description: 'Daily request limit' })
  requestsLimit?: number

  @Field(() => Float, { nullable: true, description: 'Usage percentage (0-100)' })
  usagePercent?: number

  @Field({ nullable: true, description: 'Plan or tier name' })
  plan?: string

  @Field({ nullable: true, description: 'Error or warning message' })
  message?: string
}

@ObjectType({ description: 'Status of all API services used by betting system' })
export class AllApisStatusOutput {
  @Field(() => ApiServiceStatus, { description: 'API-Football status (fixtures, stats, odds)' })
  apiFootball: ApiServiceStatus

  @Field(() => ApiServiceStatus, { description: 'The Odds API status (Pinnacle sharp lines)' })
  theOddsApi: ApiServiceStatus

  @Field(() => ApiServiceStatus, { description: 'Open-Meteo status (weather data)' })
  openMeteo: ApiServiceStatus

  @Field({ description: 'Overall system health: all APIs operational' })
  allOperational: boolean

  @Field(() => [String], { description: 'List of warnings or issues' })
  warnings: string[]
}
