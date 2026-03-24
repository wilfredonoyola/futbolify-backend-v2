import { registerEnumType } from '@nestjs/graphql'

// League tier classification (1 = highest priority, 4 = lowest)
export enum LeagueTier {
  TIER_1 = 1,
  TIER_2 = 2,
  TIER_3 = 3,
  TIER_4 = 4,
}

registerEnumType(LeagueTier, {
  name: 'LeagueTier',
  description: 'League priority tier for betting analysis',
})

// Season type for leagues
export enum SeasonType {
  WINTER = 'winter',
  SUMMER = 'summer',
}

registerEnumType(SeasonType, {
  name: 'SeasonType',
  description: 'Type of season calendar for the league',
})

// Bookmaker quality classification
export enum BookmakerQuality {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

registerEnumType(BookmakerQuality, {
  name: 'BookmakerQuality',
  description: 'Quality of odds modeling by bookmakers for this league',
})

// Pick status
export enum PickStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  WON = 'WON',
  LOST = 'LOST',
  VOID = 'VOID',
  CANCELLED = 'CANCELLED',
}

registerEnumType(PickStatus, {
  name: 'PickStatus',
  description: 'Status of a betting pick',
})

// Combo status
export enum ComboStatus {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
  PARTIAL = 'PARTIAL',
  CANCELLED = 'CANCELLED',
}

registerEnumType(ComboStatus, {
  name: 'ComboStatus',
  description: 'Status of a betting combination',
})

// Combo type classification
export enum ComboType {
  GEMELA = 'GEMELA',
  GEMELA_INVERTIDA = 'GEMELA_INVERTIDA',
  CROSS_MERCADO = 'CROSS_MERCADO',
  CROSS_LIGA = 'CROSS_LIGA',
  TRIPLE_CORRELACIONADO = 'TRIPLE_CORRELACIONADO',
  DOBLE_GEMELA = 'DOBLE_GEMELA',
  SHARP_GEMELA = 'SHARP_GEMELA',
  SHARP_CROSS_MERCADO = 'SHARP_CROSS_MERCADO',
}

registerEnumType(ComboType, {
  name: 'ComboType',
  description: 'Type of betting combination based on correlation strategy',
})

// Market type
export enum MarketType {
  OVER_05_1H = 'over_05_1h',
  OVER_15_1H = 'over_15_1h',
  OVER_75_CORNERS = 'over_75_corners',
  OVER_85_CORNERS = 'over_85_corners',
  OVER_95_CORNERS = 'over_95_corners',
  OVER_105_CORNERS = 'over_105_corners',
  OVER_115_CORNERS = 'over_115_corners',
  OVER_125_CORNERS = 'over_125_corners',
  OVER_45_CORNERS_1H = 'over_45_corners_1h',
  UNDER_75_CORNERS = 'under_75_corners',
  UNDER_85_CORNERS = 'under_85_corners',
  UNDER_95_CORNERS = 'under_95_corners',
  UNDER_105_CORNERS = 'under_105_corners',
  CORNERS_HANDICAP = 'corners_handicap',
}

registerEnumType(MarketType, {
  name: 'MarketType',
  description: 'Type of betting market',
})

// Market direction
export enum MarketDirection {
  OVER = 'OVER',
  UNDER = 'UNDER',
}

registerEnumType(MarketDirection, {
  name: 'MarketDirection',
  description: 'Direction of the market bet',
})

// Time window for combinadas
export enum TimeWindow {
  WINDOW_A = 'WINDOW_A', // Saturday 7-9 AM (El Salvador)
  WINDOW_B = 'WINDOW_B', // Saturday 9 AM - 1 PM
  WINDOW_C = 'WINDOW_C', // Sunday 7 AM - 1 PM
}

registerEnumType(TimeWindow, {
  name: 'TimeWindow',
  description: 'Time window for betting combinations',
})

// Steam move direction
export enum SteamMoveDirection {
  FAVORABLE = 'FAVORABLE',
  CONTRA = 'CONTRA',
}

registerEnumType(SteamMoveDirection, {
  name: 'SteamMoveDirection',
  description: 'Direction of steam move relative to our pick',
})

// Confidence classification
export enum ConfidenceLevel {
  ALTA = 'ALTA',
  MEDIA = 'MEDIA',
  BAJA = 'BAJA',
  SIN_VALUE = 'SIN_VALUE',
}

registerEnumType(ConfidenceLevel, {
  name: 'ConfidenceLevel',
  description: 'Confidence level for a pick based on edge',
})

// Combo score classification
export enum ComboScoreLevel {
  ELITE = 'ELITE', // 80-100
  FUERTE = 'FUERTE', // 65-79
  SOLIDA = 'SOLIDA', // 50-64
  MARGINAL = 'MARGINAL', // 35-49
  DESCARTAR = 'DESCARTAR', // < 35
}

registerEnumType(ComboScoreLevel, {
  name: 'ComboScoreLevel',
  description: 'Score classification for betting combinations',
})
