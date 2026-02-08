import { Field, ObjectType } from '@nestjs/graphql';
import { UserRole } from '../schemas/user.schema';

@ObjectType()
export class UserOutputDto {
  @Field()
  id: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  userName?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field(() => [UserRole])
  roles: UserRole[];
}
