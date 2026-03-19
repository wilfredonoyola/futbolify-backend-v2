import { ObjectType, Field, Int } from '@nestjs/graphql'

@ObjectType()
export class TeamStandingDto {
  @Field(() => Int)
  rank: number

  @Field(() => Int, { nullable: true })
  teamId: number | null

  @Field()
  teamName: string

  @Field({ nullable: true })
  teamLogo: string | null

  @Field(() => Int)
  points: number

  @Field(() => Int)
  played: number

  @Field(() => Int)
  won: number

  @Field(() => Int)
  drawn: number

  @Field(() => Int)
  lost: number

  @Field(() => Int)
  goalsFor: number

  @Field(() => Int)
  goalsAgainst: number

  @Field(() => Int)
  goalDiff: number

  @Field({ nullable: true })
  form: string | null

  @Field({ nullable: true })
  description: string | null
}

@ObjectType()
export class StandingsGroupDto {
  @Field()
  name: string

  @Field(() => [TeamStandingDto])
  teams: TeamStandingDto[]
}

@ObjectType()
export class LeagueStandingsDto {
  @Field()
  leagueId: string

  @Field()
  leagueName: string

  @Field({ nullable: true })
  leagueLogo: string | null

  @Field()
  country: string

  @Field(() => Int)
  season: number

  @Field()
  type: string // 'league' | 'groups'

  @Field(() => [StandingsGroupDto])
  groups: StandingsGroupDto[]
}

@ObjectType()
export class AvailableLeagueDto {
  @Field()
  id: string

  @Field()
  name: string

  @Field(() => Int)
  apiId: number

  @Field({ nullable: true })
  country: string | null

  @Field()
  logoUrl: string

  @Field(() => Int)
  order: number

  @Field()
  isActive: boolean
}
