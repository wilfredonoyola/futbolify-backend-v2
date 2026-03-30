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
export class BilingualStringDto {
  @Field()
  es: string

  @Field()
  en: string
}

@ObjectType()
export class LeagueMetadataDto {
  @Field(() => Int, { nullable: true })
  teams?: number

  @Field(() => Int, { nullable: true })
  matches?: number

  @Field(() => Int, { nullable: true })
  groups?: number

  @Field(() => Int, { nullable: true })
  venues?: number
}

@ObjectType()
export class AvailableLeagueDto {
  @Field()
  id: string

  @Field(() => BilingualStringDto)
  name: BilingualStringDto

  @Field(() => BilingualStringDto)
  shortName: BilingualStringDto

  @Field(() => BilingualStringDto)
  slug: BilingualStringDto

  @Field()
  type: string // 'league' | 'tournament'

  @Field(() => Int)
  apiId: number

  @Field({ nullable: true })
  country: string | null

  @Field({ nullable: true })
  confederation: string | null

  @Field()
  logoUrl: string

  @Field(() => Int)
  order: number

  @Field()
  isActive: boolean

  @Field()
  status: string // 'active' | 'upcoming' | 'finished' | 'offseason'

  @Field({ nullable: true })
  season: string | null

  @Field({ nullable: true })
  startDate: string | null

  @Field({ nullable: true })
  endDate: string | null

  @Field()
  color: string

  @Field({ nullable: true })
  colorSecondary: string | null

  @Field(() => [String])
  features: string[]

  @Field(() => LeagueMetadataDto, { nullable: true })
  metadata: LeagueMetadataDto | null
}
