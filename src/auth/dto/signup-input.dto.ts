import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class SignupInputDto {
  @Field()
  email: string;

  @Field()
  password: string;
}
