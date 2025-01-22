import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { CategoryOutput } from 'src/category/dto/category.output';

@ObjectType()
export class ServiceOutput {
  @Field(() => ID)
  serviceId: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float)
  price: number;

  @Field(() => CategoryOutput, { nullable: true })
  category?: CategoryOutput;

  @Field(() => Int)
  createdAt: number;

  @Field(() => Int)
  updatedAt: number;
}
