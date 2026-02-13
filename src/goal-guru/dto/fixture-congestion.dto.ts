import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class FixtureInfoDto {
  @Field()
  date: string;

  @Field()
  opponent: string;

  @Field()
  competition: string;
}

@ObjectType()
export class FixtureCongestionDto {
  @Field(() => Int)
  recentGames: number; // Games in last 7 days

  @Field(() => Int)
  upcomingGames: number;

  @Field({ nullable: true })
  nextGame?: string;

  @Field(() => [FixtureInfoDto])
  fixtures: FixtureInfoDto[];
}
