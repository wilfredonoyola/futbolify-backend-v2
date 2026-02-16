import { registerEnumType } from '@nestjs/graphql'

/**
 * FHG Log Level - Severity levels for FHG logging
 */
export enum FhgLogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

registerEnumType(FhgLogLevel, {
  name: 'FhgLogLevel',
  description: 'Log level for FHG system logs',
})
