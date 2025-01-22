import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { InventoryStatus } from '../enums/status.enum';
import { CategoryOutput } from 'src/category/dto/category.output';

@ObjectType()
export class InventoryOutput {
  @Field(() => ID)
  inventoryId: string;

  @Field()
  name: string;

  @Field(() => Int)
  quantity: number;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  sku?: string;

  @Field(() => Float)
  price: number;

  @Field({ nullable: true })
  purchasePrice?: number;

  @Field(() => InventoryStatus, { nullable: true })
  status?: InventoryStatus;

  @Field(() => CategoryOutput, { nullable: true })
  category?: CategoryOutput;

  @Field(() => Int)
  createdAt: number;

  @Field(() => Int)
  updatedAt: number;

  @Field(() => Int, { nullable: true })
  expirationDate?: number;
}
