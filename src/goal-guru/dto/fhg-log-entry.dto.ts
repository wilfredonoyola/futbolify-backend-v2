import { ObjectType, Field, ID, InputType, Int } from '@nestjs/graphql'
import { FhgLogLevel } from '../enums/fhg-log-level.enum'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'
import GraphQLJSON from 'graphql-type-json'

@ObjectType()
export class FhgLogEntryDto {
  @Field(() => ID)
  id: string

  @Field(() => FhgLogLevel)
  level: FhgLogLevel

  @Field(() => FhgLogCategory)
  category: FhgLogCategory

  @Field()
  message: string

  @Field(() => GraphQLJSON, { nullable: true })
  data?: Record<string, unknown>

  @Field({ nullable: true })
  matchId?: string

  @Field({ nullable: true })
  pipelineId?: string

  @Field({ nullable: true })
  selectionId?: string

  @Field()
  timestamp: Date
}

@InputType()
export class FhgLogFilterInput {
  @Field(() => FhgLogLevel, { nullable: true })
  level?: FhgLogLevel

  @Field(() => FhgLogCategory, { nullable: true })
  category?: FhgLogCategory

  @Field({ nullable: true })
  matchId?: string

  @Field({ nullable: true })
  pipelineId?: string

  @Field({ nullable: true })
  startDate?: Date

  @Field({ nullable: true })
  endDate?: Date

  @Field(() => Int, { nullable: true })
  limit?: number

  @Field(() => Int, { nullable: true })
  offset?: number
}
