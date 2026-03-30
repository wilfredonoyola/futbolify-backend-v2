import { ObjectType, Field, Int, Float, InputType } from '@nestjs/graphql'
import { TimelineEventDto } from './timeline-event.dto'
import { MatchLineupsDto } from './lineup.dto'
import { MatchState } from '../enums/match-state.enum'
import { BettingAnalysisDto } from './betting-analysis.dto'

@ObjectType()
export class PossessionDto {
  @Field(() => Int)
  home: number

  @Field(() => Int)
  away: number
}

@ObjectType()
export class LiveMatchOutputDto {
  @Field(() => Int)
  id: number

  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field(() => String, { nullable: true })
  homeTeamLogo?: string

  @Field(() => String, { nullable: true })
  awayTeamLogo?: string

  @Field(() => Int, { nullable: true })
  homeTeamId?: number

  @Field(() => Int, { nullable: true })
  awayTeamId?: number

  @Field(() => String, { nullable: true })
  kickoffTime?: string

  @Field(() => String, { nullable: true })
  leagueId?: string

  @Field(() => String, { nullable: true })
  leagueName?: string

  @Field(() => String, { nullable: true })
  leagueLogo?: string

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

  @Field(() => Float, { nullable: true })
  recentActivityScore?: number

  @Field(() => Boolean, { nullable: true })
  hasRecentActivity?: boolean

  @Field(() => PossessionDto, { nullable: true })
  possession?: { home: number; away: number }

  /** Tiros totales por equipo (API-Football). */
  @Field(() => PossessionDto, { nullable: true })
  shotsSplit?: { home: number; away: number }

  @Field(() => PossessionDto, { nullable: true })
  shotsOnTargetSplit?: { home: number; away: number }

  @Field(() => PossessionDto, { nullable: true })
  cornersSplit?: { home: number; away: number }

  @Field(() => PossessionDto, { nullable: true })
  foulsSplit?: { home: number; away: number }

  @Field(() => Float, { nullable: true })
  xG?: number

  @Field(() => PossessionDto, { nullable: true })
  attacks?: { home: number; away: number }

  @Field(() => PossessionDto, { nullable: true })
  bigChances?: { home: number; away: number }

  @Field(() => BettingAnalysisDto, { nullable: true })
  bettingAnalysis?: BettingAnalysisDto

  @Field(() => Boolean, { nullable: true })
  marketAvailable?: boolean

  @Field(() => String, { nullable: true })
  lastEventType?: string

  @Field(() => Boolean, { nullable: true })
  isGoodForOver05?: boolean

  @Field(() => Boolean, { nullable: true })
  isGoodForOver15?: boolean

  @Field(() => Boolean, { nullable: true })
  isLateMatch?: boolean

  @Field(() => [String], { nullable: true })
  bookmakers?: string[]

  @Field(() => [TimelineEventDto], { nullable: true })
  timeline?: TimelineEventDto[]

  @Field(() => MatchState, { nullable: true })
  state?: MatchState

  @Field(() => String, { nullable: true })
  round?: string

  @Field(() => Int, { nullable: true })
  yellowCards?: number

  @Field(() => Int, { nullable: true })
  redCards?: number

  @Field(() => Int, { nullable: true })
  offsides?: number

  @Field(() => Int, { nullable: true })
  shotsOffTarget?: number

  @Field(() => MatchLineupsDto, { nullable: true })
  lineups?: MatchLineupsDto
}

@InputType()
export class LateMatchOptionsDto {
  @Field(() => Int, { nullable: true })
  minMinute?: number

  @Field(() => Float, { nullable: true })
  minPressureScore?: number

  @Field({ nullable: true })
  requireRecentActivity?: boolean

  @Field(() => Int, { nullable: true })
  maxGoals?: number
}
