import { Field, ObjectType, ID, Int } from '@nestjs/graphql'

@ObjectType()
export class ViewerCountUpdate {
  @Field(() => ID)
  streamId: string

  @Field(() => Int)
  viewerCount: number
}
