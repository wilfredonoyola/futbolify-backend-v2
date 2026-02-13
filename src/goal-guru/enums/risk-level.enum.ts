import { registerEnumType } from '@nestjs/graphql'

export enum RiskLevel {
  BAJO = 'BAJO',
  MEDIO = 'MEDIO',
  ALTO = 'ALTO',
}

registerEnumType(RiskLevel, {
  name: 'RiskLevel',
  description: 'Risk level for Goal Guru betting picks',
})
