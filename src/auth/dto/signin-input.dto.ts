import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class SigninInputDto {
  @Field()
  email: string;

  @Field()
  password: string;
}
