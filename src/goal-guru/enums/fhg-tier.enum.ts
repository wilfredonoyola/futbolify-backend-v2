import { registerEnumType } from '@nestjs/graphql'

/**
 * FHG Tier - League tier classification for G1H betting
 * MAX: Best leagues for G1H (avg > 1.40 goals in 1H)
 * HIGH: Good leagues (avg 1.25-1.40)
 * MEDIUM: Average leagues (avg 1.15-1.25)
 * LOW: Tactical/defensive leagues - NOT processed for G1H
 */
export enum FhgTier {
  MAX = 'MAX',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

registerEnumType(FhgTier, {
  name: 'FhgTier',
  description: 'League tier classification for G1H betting potential',
})
