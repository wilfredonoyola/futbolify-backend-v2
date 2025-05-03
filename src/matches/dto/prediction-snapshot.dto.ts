import { Field, Int, Float, ObjectType, InputType } from '@nestjs/graphql'

@ObjectType()
@InputType('PredictionSnapshotInput')
export class PredictionSnapshotDto {
  @Field(() => Int)
  id: number

  @Field(() => Int)
  minute: number

  @Field(() => Int)
  scoreHome: number

  @Field(() => Int)
  scoreAway: number

  @Field(() => Float)
  pressureScore: number

  @Field(() => Float)
  recentActivityScore: number

  @Field(() => [String])
  lastEventTypes: string[]
}
