import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class TeamRecordDto {
  @Field(() => Int)
  wins: number;

  @Field(() => Int)
  draws: number;

  @Field(() => Int)
  losses: number;
}

@ObjectType()
export class TeamStatsDto {
  @Field()
  form: string; // "WWDLW"

  @Field(() => Int)
  goalsFor: number;

  @Field(() => Int)
  goalsAgainst: number;

  @Field(() => Float)
  avgGoalsScored: number;

  @Field(() => Float)
  avgGoalsConceded: number;

  @Field(() => Int)
  cleanSheets: number;

  @Field(() => Int)
  failedToScore: number;

  @Field(() => Int)
  wins: number;

  @Field(() => Int)
  draws: number;

  @Field(() => Int)
  losses: number;

  @Field(() => TeamRecordDto)
  homeRecord: TeamRecordDto;

  @Field(() => TeamRecordDto)
  awayRecord: TeamRecordDto;
}
