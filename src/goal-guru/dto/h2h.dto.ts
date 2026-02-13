import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class H2HDto {
  @Field(() => Int)
  team1Wins: number;

  @Field(() => Int)
  team2Wins: number;

  @Field(() => Int)
  draws: number;

  @Field(() => Float)
  avgGoals: number;

  @Field(() => [String])
  lastResults: string[]; // ["W", "L", "D", "W", "W"]

  @Field(() => Int)
  totalMatches: number;
}
