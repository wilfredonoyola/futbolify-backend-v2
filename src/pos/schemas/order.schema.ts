import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ObjectType, ID, Float, Int } from '@nestjs/graphql';
import { ItemType } from '../enums/item-type.enum';
import { Company } from 'src/company/schemas/company.schema';
import { User } from 'src/users/schemas/user.schema';

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class Order extends Document {
  @Field(() => ID)
  get orderId(): string {
    return this._id.toString();
  }

  @Prop({ type: [{ type: Types.ObjectId, ref: 'OrderItem' }], required: true })
  @Field(() => [OrderItem])
  items: Types.Array<OrderItem>;

  @Prop({ required: true })
  @Field(() => Float)
  total: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  @Field({ nullable: true })
  customerId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  @Field(() => Company)
  company: Company;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => User)
  createdBy: User;

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop()
  @Field(() => Int)
  updatedAt: number;
}

@Schema()
@ObjectType()
export class OrderItem {
  @Prop({ required: true })
  @Field()
  id: string;

  @Prop({ required: true })
  @Field()
  name: string;

  @Prop({ required: true })
  @Field(() => ItemType)
  type: ItemType;

  @Prop({ required: true })
  @Field(() => Float)
  price: number;

  @Prop({ required: true })
  @Field(() => Int)
  quantity: number;

  @Prop({ nullable: true })
  @Field(() => Float, { nullable: true })
  discount?: number;

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop({ required: true })
  @Field(() => Float)
  total: number;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
