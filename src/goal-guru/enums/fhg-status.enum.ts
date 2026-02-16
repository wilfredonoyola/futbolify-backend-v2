import { registerEnumType } from '@nestjs/graphql'

/**
 * FHG Health Status - System health based on CLV metrics
 * GREEN: CLV >= 2% - Edge is working
 * YELLOW: CLV 0-2% - Edge is marginal, monitor closely
 * RED: CLV < 0% - No edge, system should be paused
 */
export enum FhgStatus {
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  RED = 'RED',
}

registerEnumType(FhgStatus, {
  name: 'FhgStatus',
  description: 'Health status of FHG system based on CLV',
})
