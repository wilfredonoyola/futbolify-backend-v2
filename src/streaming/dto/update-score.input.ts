import { Field, InputType, Int, ID } from '@nestjs/graphql'
import { IsNotEmpty, IsInt, Min } from 'class-validator'

@InputType()
export class UpdateScoreInput {
  @Field(() => ID)
  @IsNotEmpty()
  streamId: string

  @Field(() => Int)
  @IsInt()
  @Min(0)
  homeScore: number

  @Field(() => Int)
  @IsInt()
  @Min(0)
  awayScore: number
}
