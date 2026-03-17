import { ObjectType, Field, Int, InputType } from '@nestjs/graphql';

@ObjectType()
export class TeamInfoDto {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  nameEn?: string;

  @Field()
  code: string;

  @Field({ nullable: true })
  flag?: string;

  @Field({ nullable: true })
  logo?: string;
}

@ObjectType()
export class StandingEntryDto {
  @Field(() => Int)
  position: number;

  @Field()
  teamId: string;

  @Field(() => TeamInfoDto)
  team: TeamInfoDto;

  @Field(() => Int)
  played: number;

  @Field(() => Int)
  won: number;

  @Field(() => Int)
  drawn: number;

  @Field(() => Int)
  lost: number;

  @Field(() => Int)
  goalsFor: number;

  @Field(() => Int)
  goalsAgainst: number;

  @Field(() => Int)
  goalDifference: number;

  @Field(() => Int)
  points: number;

  @Field(() => [String], { nullable: true })
  form?: string[]; // ["W", "W", "L", "D", "W"]

  @Field({ nullable: true })
  zone?: string; // "champions", "europa", "relegation", null
}

@ObjectType()
export class StandingsDto {
  @Field()
  leagueId: string;

  @Field()
  leagueName: string;

  @Field({ nullable: true })
  season?: string;

  @Field({ nullable: true })
  conference?: string; // For MLS: "Eastern" or "Western"

  @Field(() => [StandingEntryDto])
  entries: StandingEntryDto[];

  @Field({ nullable: true })
  lastUpdated?: string;
}

@InputType()
export class StandingsInput {
  @Field()
  leagueId: string;

  @Field({ nullable: true })
  season?: string;

  @Field({ nullable: true })
  conference?: string; // For MLS
}
