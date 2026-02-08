import { InputType, Field, PartialType } from '@nestjs/graphql';
import { UserRole } from '../schemas/user.schema';
import { UserOutputDto } from './user-output.dto';

@InputType()
export class UpdateUserInput extends PartialType(UserOutputDto) {
  @Field(() => [UserRole], { nullable: true })
  roles?: UserRole[];

  @Field({ nullable: true })
  userName?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  avatarUrl?: string;
}
