import { Field, InputType, ObjectType } from '@nestjs/graphql'
import { LinkedProvider } from 'src/users/schemas/user.schema'

@InputType()
export class LinkGoogleAccountInput {
  @Field()
  idToken: string
}

@ObjectType()
export class LinkedProviderInfo {
  @Field()
  provider: string

  @Field()
  email: string

  @Field()
  linkedAt: Date

  @Field()
  isPrimary: boolean
}

@ObjectType()
export class LinkAccountResponse {
  @Field()
  success: boolean

  @Field({ nullable: true })
  message?: string

  @Field(() => [LinkedProviderInfo])
  linkedProviders: LinkedProviderInfo[]
}
