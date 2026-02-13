import { InputType, Field } from '@nestjs/graphql'
import { GoalGuruMatchDto } from './goal-guru-match.dto'
import { MatchContextDto } from './match-context.dto'

@InputType()
export class MatchInput {
  @Field()
  home: string

  @Field()
  away: string

  @Field()
  date: string

  @Field()
  time: string

  @Field()
  comp: string
}

@InputType()
export class OddsInput {
  @Field(() => Number)
  o25: number

  @Field(() => Number)
  u25: number

  @Field(() => Number)
  btts_y: number

  @Field(() => Number)
  btts_n: number

  @Field(() => Number)
  o15: number

  @Field(() => Number)
  o35: number

  @Field(() => Number)
  g1h: number
}

@InputType()
export class ContextInput {
  @Field()
  homePos: string

  @Field()
  awayPos: string

  @Field()
  homeForm: string

  @Field()
  awayForm: string

  @Field()
  homeGoals: string

  @Field()
  awayGoals: string

  @Field()
  h2h: string

  @Field()
  injuries: string

  @Field()
  context: string

  @Field(() => OddsInput)
  odds: OddsInput

  @Field()
  keyStats: string
}

@InputType()
export class AnalyzeMatchesInput {
  @Field(() => [MatchInput])
  matches: MatchInput[]

  @Field(() => [ContextInput])
  contexts: ContextInput[]

  @Field()
  leagueName: string
}
