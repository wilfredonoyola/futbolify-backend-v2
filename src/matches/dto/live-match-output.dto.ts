import {
  ObjectType,
  Field,
  Int,
  Float,
  registerEnumType,
} from '@nestjs/graphql'

// Primero definimos el Enum de estados posibles
export enum MatchState {
  NotStarted = 'not_started',
  FirstHalf = 'first_half',
  HalfTime = 'half_time', // 👈 NUEVO
  SecondHalf = 'second_half',
  Potential = 'potential',
  ReadyToBet = 'ready_to_bet',
  Normal = 'normal',
  NoBet = 'no_bet',
  Finished = 'finished',
  BetPlaced = 'bet_placed',
}

// Registramos el Enum para GraphQL
registerEnumType(MatchState, {
  name: 'MatchState',
})

@ObjectType()
export class TimelineEventDto {
  @Field()
  type: string // "Goal", "Card", "Substitution", etc.

  @Field()
  detail: string // "Normal Goal", "Yellow Card", etc.

  @Field()
  team: string

  @Field({ nullable: true })
  player?: string

  @Field({ nullable: true })
  assist?: string

  @Field(() => Int)
  minute: number
}

@ObjectType()
export class LiveMatchOutputDto {
  @Field(() => Int)
  id: number

  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field(() => Int, { nullable: true })
  minute?: number

  @Field(() => Int)
  scoreHome: number

  @Field(() => Int)
  scoreAway: number

  @Field(() => Int, { nullable: true })
  shots?: number

  @Field(() => Int, { nullable: true })
  shotsOnTarget?: number

  @Field(() => Int, { nullable: true })
  dangerousAttacks?: number

  @Field(() => Int, { nullable: true })
  corners?: number

  @Field(() => Float, { nullable: true })
  pressureScore?: number

  @Field(() => Boolean, { nullable: true })
  hasRecentActivity?: boolean

  @Field(() => Boolean, { nullable: true })
  marketAvailable?: boolean

  @Field(() => String, { nullable: true })
  lastEventType?: string

  @Field(() => Boolean, { nullable: true })
  isGoodForOver05?: boolean

  @Field(() => Boolean, { nullable: true })
  isGoodForOver15?: boolean

  @Field(() => [String], { nullable: true })
  bookmakers?: string[]

  @Field(() => [TimelineEventDto], { nullable: true })
  timeline?: TimelineEventDto[]

  @Field(() => MatchState, { nullable: true })
  state?: MatchState // 👈 NUEVO: Estado del partido
}
