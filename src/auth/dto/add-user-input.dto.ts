import { Field, InputType } from '@nestjs/graphql';
import { UserRole } from '../../users/schemas/user.schema';

@InputType()
export class AddUserInputDto {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  phone: number;

  @Field(() => UserRole, { nullable: true })
  role?: UserRole;

  @Field({ nullable: true })
  name?: string;
}
