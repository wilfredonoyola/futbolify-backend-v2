import { ObjectType, Field, Float, InputType } from '@nestjs/graphql'

@ObjectType()
export class OddsDto {
  @Field(() => Float)
  o25: number

  @Field(() => Float)
  u25: number

  @Field(() => Float)
  btts_y: number

  @Field(() => Float)
  btts_n: number

  @Field(() => Float)
  o15: number

  @Field(() => Float)
  o35: number

  @Field(() => Float)
  g1h: number
}

@ObjectType()
export class MatchContextDto {
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

  @Field(() => OddsDto)
  odds: OddsDto

  @Field()
  keyStats: string
}

@InputType()
export class MatchContextInput {
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

  @Field()
  leagueName: string
}
