import { ObjectType, Field, Int, Float } from '@nestjs/graphql'

@ObjectType()
export class TimelineEventDto {
  @Field()
  type: string // "Goal", "Card", "Substitution", etc.

  @Field()
  detail: string // "Normal Goal", "Yellow Card", etc.

  @Field()
  team: string

  @Field({ nullable: true })
  player?: string

  @Field({ nullable: true })
  assist?: string

  @Field(() => Int)
  minute: number

  @Field({ nullable: true })
  isHome?: boolean

  @Field(() => Float, { nullable: true })
  importance?: number
}
