import { ObjectType, Field, Int, registerEnumType } from '@nestjs/graphql'

export enum FootballSearchKind {
  PLAYER = 'player',
  TEAM = 'team',
}

registerEnumType(FootballSearchKind, {
  name: 'FootballSearchKind',
})

@ObjectType()
export class FootballSearchResultDto {
  @Field(() => FootballSearchKind)
  kind: FootballSearchKind

  @Field(() => Int)
  id: number

  @Field()
  name: string

  @Field(() => String, { nullable: true })
  photo?: string

  @Field(() => String, { nullable: true })
  /** Liga, país o ciudad — texto corto para la UI */
  meta?: string
}

@ObjectType()
export class PlayerSeasonStatDto {
  @Field()
  leagueId: string

  @Field()
  leagueName: string

  @Field(() => Int)
  appearances: number

  @Field(() => Int)
  lineups: number

  @Field(() => Int)
  goals: number

  @Field(() => Int)
  assists: number

  @Field(() => Int)
  minutes: number
}

@ObjectType()
export class PlayerProfileDto {
  @Field(() => Int)
  id: number

  @Field()
  name: string

  @Field(() => String, { nullable: true })
  firstname?: string

  @Field(() => String, { nullable: true })
  lastname?: string

  @Field(() => String, { nullable: true })
  photo?: string

  @Field(() => String, { nullable: true })
  nationality?: string

  @Field(() => String, { nullable: true })
  birthPlace?: string

  @Field(() => String, { nullable: true })
  birthDate?: string

  @Field(() => String, { nullable: true })
  height?: string

  @Field(() => Int, { nullable: true })
  teamId?: number

  @Field(() => String, { nullable: true })
  teamName?: string

  @Field(() => String, { nullable: true })
  teamLogo?: string

  @Field(() => [PlayerSeasonStatDto])
  seasonStats: PlayerSeasonStatDto[]
}
