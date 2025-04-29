import { registerEnumType } from '@nestjs/graphql'

export enum MatchState {
  NotStarted = 'NOT_STARTED',
  FirstHalf = 'FIRST_HALF',
  HalfTime = 'HALF_TIME',
  SecondHalf = 'SECOND_HALF',
  Finished = 'FINISHED',
  Normal = 'NORMAL',
  Potential = 'POTENTIAL',
  ReadyToBet = 'READY_TO_BET',
  NoBet = 'NO_BET',
  // Estados para partidos tardíos
  NoLateValue = 'NO_LATE_VALUE',
  ModerateLateValue = 'MODERATE_LATE_VALUE',
  HighLateValue = 'HIGH_LATE_VALUE',
}

registerEnumType(MatchState, {
  name: 'MatchState',
})
