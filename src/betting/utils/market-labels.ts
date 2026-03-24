import { MarketType } from '../enums/betting.enums'

/**
 * Human-readable labels for betting markets
 */
export const marketLabels: Record<string, string> = {
  // Goals 1st Half
  [MarketType.OVER_05_1H]: 'Goles +0.5 (1T)',
  [MarketType.OVER_15_1H]: 'Goles +1.5 (1T)',

  // Corners Total
  [MarketType.OVER_75_CORNERS]: 'Corners +7.5',
  [MarketType.OVER_85_CORNERS]: 'Corners +8.5',
  [MarketType.OVER_95_CORNERS]: 'Corners +9.5',
  [MarketType.OVER_105_CORNERS]: 'Corners +10.5',
  [MarketType.OVER_115_CORNERS]: 'Corners +11.5',
  [MarketType.OVER_125_CORNERS]: 'Corners +12.5',

  // Corners 1st Half
  [MarketType.OVER_45_CORNERS_1H]: 'Corners +4.5 (1T)',

  // Under Corners
  [MarketType.UNDER_75_CORNERS]: 'Corners -7.5',
  [MarketType.UNDER_85_CORNERS]: 'Corners -8.5',
  [MarketType.UNDER_95_CORNERS]: 'Corners -9.5',
  [MarketType.UNDER_105_CORNERS]: 'Corners -10.5',

  // Handicap
  [MarketType.CORNERS_HANDICAP]: 'Hándicap Corners',
}

/**
 * Get human-readable label for a market
 */
export function getMarketLabel(market: MarketType | string): string {
  return marketLabels[market] || market.toString().replace(/_/g, ' ')
}
