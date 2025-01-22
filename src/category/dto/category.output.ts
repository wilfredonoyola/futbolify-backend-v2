import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CategoryOutput {
  @Field(() => ID)
  categoryId: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Int)
  createdAt: number;

  @Field(() => Int)
  updatedAt: number;
}
