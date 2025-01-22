import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CompanyOutput {
  @Field(() => ID)
  companyId: string; // Mapea `_id` a `companyId`

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  address?: string;

  @Field(() => Int)
  createdAt: number; // Unix timestamp

  @Field(() => Int)
  updatedAt: number; // Unix timestamp
}
