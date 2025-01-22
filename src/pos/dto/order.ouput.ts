import { Field, ObjectType, Float, Int, ID } from '@nestjs/graphql';
import { ItemType } from '../enums/item-type.enum';

@ObjectType()
export class OrderItemOutput {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field(() => ItemType)
  type: ItemType;

  @Field(() => Float)
  price: number;

  @Field(() => Int)
  quantity: number;

  @Field(() => Float, { nullable: true })
  discount?: number;
}

@ObjectType()
export class OrderOutput {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  companyId?: string;

  @Field(() => [OrderItemOutput])
  items: OrderItemOutput[];

  @Field(() => Float)
  total: number;

  @Field(() => Int)
  createdAt: number;

  @Field(() => Int)
  updatedAt: number;
}
