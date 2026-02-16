import { registerEnumType } from '@nestjs/graphql'

/**
 * FHG Signal - Indicates the strength of a betting signal based on value margin
 * A: Best value (margin >= 8%)
 * B: Good value (margin 3-8%)
 * C: Minimal value (margin 0-3%)
 * NONE: No value (margin < 0%) - DO NOT BET
 */
export enum FhgSignal {
  A = 'A',
  B = 'B',
  C = 'C',
  NONE = 'NONE',
}

registerEnumType(FhgSignal, {
  name: 'FhgSignal',
  description: 'Signal strength for FHG selections (A=best, NONE=skip)',
})
