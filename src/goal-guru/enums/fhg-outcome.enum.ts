import { registerEnumType } from '@nestjs/graphql'

/**
 * FHG Outcome - Result of a selection after settlement
 */
export enum FhgOutcome {
  PENDING = 'PENDING',
  WON = 'WON',
  LOST = 'LOST',
  VOID = 'VOID',
}

registerEnumType(FhgOutcome, {
  name: 'FhgOutcome',
  description: 'Outcome of an FHG selection',
})
