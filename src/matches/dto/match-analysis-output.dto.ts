// src/matches/dto/match-analysis-output.dto.ts
import { Field, ObjectType } from '@nestjs/graphql'

@ObjectType()
export class MatchAnalysisOutputDto {
  @Field()
  fixtureId: number

  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field()
  minute: number

  @Field()
  scoreHome: number

  @Field()
  scoreAway: number

  @Field()
  pressureScore: number

  @Field()
  recommendation: string

  @Field()
  redFlagsDetected: boolean

  @Field()
  marketAvailable: boolean

  @Field({ nullable: true })
  lastEventType?: string

  @Field({ nullable: true })
  reasonToBet?: string

  @Field({ nullable: true })
  reasonNotToBet?: string
}
