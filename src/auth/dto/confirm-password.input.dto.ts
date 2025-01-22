import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class ConfirmPasswordInputDto {
  @Field()
  email: string;

  @Field()
  newPassword: string;

  @Field()
  verificationCode: string;
}
