import { ObjectType, Field, Int } from '@nestjs/graphql'

@ObjectType()
export class LineupPlayerDto {
  @Field(() => Int)
  id: number

  @Field()
  name: string

  @Field(() => Int, { nullable: true })
  number?: number

  /** Posición abreviada (G, D, M, F) si viene de la API. */
  @Field(() => String, { nullable: true })
  pos?: string

  /** Cuadrícula táctica (ej. 1:1) si existe. */
  @Field(() => String, { nullable: true })
  grid?: string
}

@ObjectType()
export class TeamLineupDto {
  @Field()
  teamName: string

  @Field(() => String, { nullable: true })
  teamLogo?: string

  @Field(() => String, { nullable: true })
  formation?: string

  @Field(() => String, { nullable: true })
  coachName?: string

  @Field(() => [LineupPlayerDto])
  startXI: LineupPlayerDto[]

  @Field(() => [LineupPlayerDto])
  substitutes: LineupPlayerDto[]
}

@ObjectType()
export class MatchLineupsDto {
  @Field(() => TeamLineupDto, { nullable: true })
  home?: TeamLineupDto

  @Field(() => TeamLineupDto, { nullable: true })
  away?: TeamLineupDto
}
