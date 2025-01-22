import { Field, ObjectType } from '@nestjs/graphql';
import { OrderItem } from 'src/pos/schemas/order.schema';

@ObjectType()
export class InvoiceOutput {
  @Field()
  id: string;

  @Field(() => [OrderItem])
  items: OrderItem[];

  @Field()
  total: number;

  @Field()
  createdAt: number;

  @Field()
  updatedAt: number;
}
