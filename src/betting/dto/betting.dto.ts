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

  // Corners handicap specific
  @Field(() => Float, { nullable: true, description: 'Handicap line calculated by our model (positive = home advantage)' })
  handicapLineExpected?: number

  @Field(() => Float, { nullable: true, description: 'Handicap line offered by bookmaker' })
  handicapLineBookmaker?: number

  // Calculation explanation
  @Field({ nullable: true, description: 'Human-readable explanation of how the model calculated this pick' })
  calculationExplanation?: string
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

  @Field(() => TimeWindow)
  timeWindow: TimeWindow

  @Field(() => MarketType)
  market: MarketType

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

  @Field(() => Float, { nullable: true })
  minEdge?: number

  @Field(() => Float, { nullable: true })
  minComboEV?: number

  @Field(() => Int, { nullable: true })
  minScore?: number

  @Field(() => Float, { nullable: true })
  kellyFraction?: number

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
