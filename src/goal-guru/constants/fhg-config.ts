import { FhgTier } from '../enums/fhg-tier.enum'

/**
 * FHG-ENGINE v1.0 Configuration
 * First Half Goals Engine - Core configuration constants
 */

// ============================================
// DAILY PIPELINE LIMITS
// ============================================

/** Maximum selections per day - discipline is key */
export const MAX_DAILY_SELECTIONS = 5

/** Maximum daily exposure as percentage of bankroll (8% = 0.08) */
export const MAX_DAILY_EXPOSURE = 0.08

// ============================================
// STAKE PERCENTAGES BY SIGNAL
// ============================================

/** Stake for Signal A (best value - margin >= 8%) */
export const STAKE_SIGNAL_A = 0.03 // 3%

/** Stake for Signal B (good value - margin 3-8%) */
export const STAKE_SIGNAL_B = 0.02 // 2%

/** Stake for Signal C (minimal value - margin 0-3%) */
export const STAKE_SIGNAL_C = 0.01 // 1%

// ============================================
// MINIMUM THRESHOLDS
// ============================================

/** Minimum matches played to consider reliable stats */
export const MIN_MATCHES_PLAYED = 8

/** Minimum P_real probability to consider (65%) */
export const MIN_P_REAL = 0.65

/** Minimum edge score (0-100) to create a selection */
export const MIN_EDGE_SCORE = 45

/**
 * Minimum value margin to consider
 * UPGRADED: 5% minimum (was 0%)
 * Rationale: 2-3% margin gets eaten by odds movement and vig
 */
export const MIN_MARGIN_VALOR = 0.05

// ============================================
// SIGNAL THRESHOLDS (Value Margin Percentages)
// ============================================

/** Margin threshold for Signal A (>= 10%) - UPGRADED from 8% */
export const SIGNAL_A_THRESHOLD = 0.10

/** Margin threshold for Signal B (>= 5%) - UPGRADED from 3% */
export const SIGNAL_B_THRESHOLD = 0.05

// ============================================
// ODDS QUALITY SETTINGS
// ============================================

/** Require real odds from bookmakers (set to true after API upgrade) */
export const REQUIRE_REAL_ODDS = false

/** Penalty factor for estimated odds (reduces stake) */
export const ESTIMATED_ODDS_PENALTY = 0.7

/** Minimum confidence for H2H-enhanced estimates */
export const MIN_ESTIMATION_CONFIDENCE = 'MEDIUM'

// ============================================
// PROBABILITY CALCULATION FACTORS
// ============================================

/**
 * League tier multipliers for P_base calculation
 * CALIBRATED: Reduced MAX tier from 1.08 to 1.04
 * Rationale: Nordic leagues were overestimated by ~5-8%
 */
export const LEAGUE_TIER_FACTORS: Record<FhgTier, number> = {
  [FhgTier.MAX]: 1.04,   // Was 1.08 - reduced to prevent overestimation
  [FhgTier.HIGH]: 1.02,  // Was 1.04 - slight reduction
  [FhgTier.MEDIUM]: 1.0,
  [FhgTier.LOW]: 0.96,
}

/**
 * League-specific calibration factors
 * Applied AFTER tier factor to fine-tune P_real
 * Based on historical backtesting vs actual G1H rates
 */
export const LEAGUE_CALIBRATION: Record<string, number> = {
  'danish-superliga': 0.94,    // Model overestimates by ~6%
  'eredivisie': 0.97,          // Model overestimates by ~3%
  'norwegian-eliteserien': 0.95, // Model overestimates by ~5%
  'bundesliga': 1.0,           // Well calibrated
  'champions': 1.0,            // Well calibrated
  'premier-league': 1.02,      // Model slightly underestimates
  'serie-a': 1.0,              // Well calibrated
  'liga-mx': 0.98,             // Slight overestimate
}

/** Weight for league average in P_base calculation */
export const WEIGHT_LEAGUE_AVG = 0.4

/** Weight for home team rate in P_base calculation */
export const WEIGHT_HOME_RATE = 0.3

/** Weight for away team rate in P_base calculation */
export const WEIGHT_AWAY_RATE = 0.3

// ============================================
// FACTOR RANGES (Clamps)
// ============================================

/** Minimum P_real after all factors applied */
export const P_REAL_MIN = 0.4

/** Maximum P_real after all factors applied */
export const P_REAL_MAX = 0.95

/** Minimum momentum factor */
export const MOMENTUM_FACTOR_MIN = 0.9

/** Maximum momentum factor */
export const MOMENTUM_FACTOR_MAX = 1.15

// ============================================
// SPECIFIC FACTOR VALUES
// ============================================

/** Factor for teams that score first goal before minute 25 on average */
export const AGGRESSION_FACTOR_FAST = 1.1

/** Factor for title race/relegation context */
export const CONTEXT_FACTOR_HIGH_STAKES = 1.05

/** Factor for teams with 5/5 recent matches with G1H */
export const FORM_FACTOR_PERFECT = 1.12

/** Factor for teams with 4/5 recent matches with G1H */
export const FORM_FACTOR_GOOD = 1.06

/** Factor for teams with 3/5 recent matches with G1H */
export const FORM_FACTOR_AVERAGE = 1.0

// ============================================
// HEALTH STATUS THRESHOLDS (CLV-based)
// ============================================

/** CLV threshold for GREEN status (>= 2%) */
export const CLV_GREEN_THRESHOLD = 0.02

/** CLV threshold for YELLOW status (>= 0%) - below this is RED */
export const CLV_YELLOW_THRESHOLD = 0

// ============================================
// LOG BUFFER SIZE
// ============================================

/** Maximum number of log entries to keep in memory buffer */
export const LOG_BUFFER_SIZE = 500

// ============================================
// FHG LEAGUES CONFIGURATION
// ============================================

export interface FhgLeagueConfig {
  code: string
  name: string
  tier: FhgTier
  avgG1H: number
  apiFootballId?: number
  footballDataCode?: string
  active: boolean
}

/**
 * FHG Leagues - Ordered by tier (MAX to LOW)
 * LOW tier leagues are NOT processed for G1H betting (efficient markets)
 */
export const FHG_LEAGUES: FhgLeagueConfig[] = [
  // MAX TIER - Best for G1H
  {
    code: 'danish-superliga',
    name: 'Danish Superliga',
    tier: FhgTier.MAX,
    avgG1H: 1.55,
    apiFootballId: 119,
    active: true,
  },
  {
    code: 'eredivisie',
    name: 'Eredivisie',
    tier: FhgTier.MAX,
    avgG1H: 1.4,
    apiFootballId: 88,
    active: true,
  },
  {
    code: 'norwegian-eliteserien',
    name: 'Eliteserien',
    tier: FhgTier.MAX,
    avgG1H: 1.38,
    apiFootballId: 103,
    active: true,
  },

  // HIGH TIER - Good for G1H
  {
    code: 'bundesliga',
    name: 'Bundesliga',
    tier: FhgTier.HIGH,
    avgG1H: 1.35,
    apiFootballId: 78,
    footballDataCode: 'BL1',
    active: true,
  },
  {
    code: 'champions',
    name: 'Champions League',
    tier: FhgTier.HIGH,
    avgG1H: 1.3,
    apiFootballId: 2,
    footballDataCode: 'CL',
    active: true,
  },

  // MEDIUM TIER - Average for G1H
  {
    code: 'premier-league',
    name: 'Premier League',
    tier: FhgTier.MEDIUM,
    avgG1H: 1.25,
    apiFootballId: 39,
    footballDataCode: 'PL',
    active: true,
  },
  {
    code: 'serie-a',
    name: 'Serie A',
    tier: FhgTier.MEDIUM,
    avgG1H: 1.22,
    apiFootballId: 135,
    footballDataCode: 'SA',
    active: true,
  },
  {
    code: 'liga-mx',
    name: 'Liga MX',
    tier: FhgTier.MEDIUM,
    avgG1H: 1.2,
    apiFootballId: 262,
    active: true,
  },

  // LOW TIER - NOT processed (efficient/tactical markets)
  {
    code: 'la-liga',
    name: 'La Liga',
    tier: FhgTier.LOW,
    avgG1H: 1.15,
    apiFootballId: 140,
    footballDataCode: 'PD',
    active: false, // Tactical league, markets too efficient
  },
  {
    code: 'ligue-1',
    name: 'Ligue 1',
    tier: FhgTier.LOW,
    avgG1H: 1.18,
    apiFootballId: 61,
    footballDataCode: 'FL1',
    active: false, // Tactical league
  },
]

/**
 * Get active leagues for FHG processing (excludes LOW tier)
 */
export function getActiveFhgLeagues(): FhgLeagueConfig[] {
  return FHG_LEAGUES.filter((l) => l.active && l.tier !== FhgTier.LOW)
}

/**
 * Get league config by code
 */
export function getFhgLeagueByCode(code: string): FhgLeagueConfig | undefined {
  return FHG_LEAGUES.find((l) => l.code === code)
}
