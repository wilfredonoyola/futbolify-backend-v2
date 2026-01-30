import { Field, ObjectType, ID } from '@nestjs/graphql'
import { StreamStatus } from '../schemas/stream.schema'

@ObjectType()
export class StreamStatusUpdate {
  @Field(() => ID)
  streamId: string

  @Field(() => StreamStatus)
  status: StreamStatus

  @Field({ nullable: true })
  startedAt?: Date

  @Field({ nullable: true })
  endedAt?: Date
}
