import { Field, ObjectType, ID } from '@nestjs/graphql'
import { UserRole } from 'src/users/schemas/user.schema'

@ObjectType()
export class SigninOutputDto {
  @Field(() => ID)
  id: string

  @Field()
  access_token: string

  @Field({ defaultValue: false })
  isOnboardingCompleted: boolean = false

  @Field({ nullable: true })
  avatarUrl: string

  @Field({ nullable: true })
  name?: string

  @Field({ nullable: true })
  userName?: string

  @Field(() => [UserRole])
  roles: UserRole[]
}
