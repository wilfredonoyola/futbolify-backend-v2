import { ObjectType, Field, Float } from '@nestjs/graphql';

@ObjectType()
export class MatchOddsDto {
  @Field(() => Float)
  homeWin: number;

  @Field(() => Float)
  draw: number;

  @Field(() => Float)
  awayWin: number;

  @Field(() => [String])
  bookmakers: string[];

  @Field()
  lastUpdate: string;
}
