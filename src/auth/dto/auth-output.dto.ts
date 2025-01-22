import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AuthOutputDto {
  @Field()
  access_token: string;
}
