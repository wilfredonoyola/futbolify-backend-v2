import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class BroadcastChannel {
  @Field()
  name: string;

  @Field()
  type: string;

  @Field({ nullable: true })
  affiliateUrl?: string;

  @Field({ nullable: true })
  logo?: string;
}

@ObjectType()
export class MatchBroadcasts {
  @Field(() => [BroadcastChannel])
  spanish: BroadcastChannel[];

  @Field(() => [BroadcastChannel])
  english: BroadcastChannel[];
}

@ObjectType()
export class BroadcastPlatform {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  type: string;

  @Field(() => [String])
  languages: string[];

  @Field()
  affiliateUrl: string;

  @Field({ nullable: true })
  monthlyPrice?: number;

  @Field({ nullable: true })
  annualPrice?: number;

  @Field()
  logo: string;

  @Field()
  matchCount: number;
}
