import { InputType, Field, Float, Int } from '@nestjs/graphql';
import { ItemType } from '../enums/item-type.enum';

@InputType()
export class OrderItemInput {
  @Field()
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

  @Field(() => Int, { nullable: true })
  createdAt?: number;

  @Field(() => Float, { nullable: true })
  total?: number;
}

@InputType()
export class ProcessOrderInput {
  @Field(() => [OrderItemInput])
  items: OrderItemInput[];

  @Field(() => Float)
  total: number;
}
