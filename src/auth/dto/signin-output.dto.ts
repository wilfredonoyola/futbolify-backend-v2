import { Field, ObjectType } from '@nestjs/graphql'
import { UserRole } from 'src/users/schemas/user.schema'

@ObjectType()
export class SigninOutputDto {
  @Field()
  access_token: string

  @Field({ defaultValue: false })
  isOnboardingCompleted: boolean = false

  @Field({ nullable: true })
  avatarUrl: string

  @Field(() => [UserRole])
  roles: UserRole[]
}
