import { Field, InputType, ObjectType } from '@nestjs/graphql'
import { LinkedProvider } from 'src/users/schemas/user.schema'

@InputType()
export class LinkGoogleAccountInput {
  @Field()
  idToken: string
}

@InputType()
export class AddPasswordToAccountInput {
  @Field()
  email: string

  @Field()
  password: string

  @Field()
  googleIdToken: string // To verify ownership of the Google account
}

@ObjectType()
export class CheckEmailResponse {
  @Field()
  exists: boolean

  @Field({ nullable: true })
  hasPassword?: boolean

  @Field({ nullable: true })
  hasGoogle?: boolean

  @Field({ nullable: true })
  primaryProvider?: string
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
