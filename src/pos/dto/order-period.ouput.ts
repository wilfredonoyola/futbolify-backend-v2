import { ObjectType, Field, Float, Int } from '@nestjs/graphql';
import { OrderOutput } from './order.ouput';

@ObjectType()
export class MostSoldItem {
  @Field()
  _id: string;

  @Field()
  name: string;

  @Field(() => Float)
  totalSold: number;

  @Field(() => Float)
  price: number;

  @Field()
  type: string;
}

@ObjectType()
export class WeekOutput {
  @Field(() => Int)
  weekNumber: number;

  @Field(() => [[OrderOutput]])
  days: OrderOutput[][];
}

@ObjectType()
export class OrdersGroupedByPeriodsOutput {
  @Field(() => [[OrderOutput]])
  daily: OrderOutput[][];

  @Field(() => [[OrderOutput]])
  weekly: OrderOutput[][];

  @Field(() => [[OrderOutput]])
  monthly: OrderOutput[][];
}

@ObjectType()
export class CustomDateRangeOutput {
  @Field(() => [WeekOutput])
  weeklyDate: WeekOutput[];

  @Field(() => [MostSoldItem], { nullable: true })
  mostSoldItems?: MostSoldItem[];

  @Field(() => Float, { nullable: true })
  totalRevenue?: number;

  @Field(() => Int, { nullable: true })
  totalOrders?: number;

  @Field(() => Float, { nullable: true })
  totalProductsSold?: number;

  @Field(() => Float, { nullable: true })
  totalServicesSold?: number;

  @Field(() => Float, { nullable: true })
  averageSalesValue?: number;
}
