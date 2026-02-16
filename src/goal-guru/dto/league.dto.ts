import { ObjectType, Field, Float } from '@nestjs/graphql'

@ObjectType()
export class GoalGuruLeagueDto {
  @Field()
  id: string

  @Field()
  name: string

  @Field()
  flag: string

  @Field()
  search: string

  /**
   * G1H Rating based on research
   * HIGH = Ideal for G1H betting (Eredivisie, Bundesliga, Danish Superliga)
   * MEDIUM = Standard leagues (Premier League, Serie A)
   * LOW = Tactical/defensive leagues (La Liga, Ligue 1)
   */
  @Field({ nullable: true })
  g1hRating?: string

  /**
   * Average first half goals per match
   * Based on FootyStats/Over25Tips research
   */
  @Field(() => Float, { nullable: true })
  avgG1H?: number
}
