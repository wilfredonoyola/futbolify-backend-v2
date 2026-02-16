import { registerEnumType } from '@nestjs/graphql'

/**
 * FHG Log Category - Categories for organizing FHG logs
 */
export enum FhgLogCategory {
  PREDICTION = 'PREDICTION',
  VALUE = 'VALUE',
  PIPELINE = 'PIPELINE',
  SELECTION = 'SELECTION',
  SETTLEMENT = 'SETTLEMENT',
  HEALTH = 'HEALTH',
  ODDS = 'ODDS',
  STATS = 'STATS',
  CRON = 'CRON',
}

registerEnumType(FhgLogCategory, {
  name: 'FhgLogCategory',
  description: 'Category for FHG system logs',
})
