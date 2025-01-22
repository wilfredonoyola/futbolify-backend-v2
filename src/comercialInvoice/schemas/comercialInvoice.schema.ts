import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ObjectType, ID, Float, Int } from '@nestjs/graphql';
import { Company } from 'src/company/schemas/company.schema';
import { User } from 'src/users/schemas/user.schema';
import { OrderItem } from 'src/pos/schemas/order.schema';

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class Invoice extends Document {
  @Field(() => ID)
  get editedInvoiceId(): string {
    return this._id.toString();
  }

  @Prop({ type: [{ type: Types.ObjectId, ref: 'OrderItem' }], required: true })
  @Field(() => [OrderItem])
  items: Types.Array<OrderItem>;

  @Prop({ required: true })
  @Field(() => Float)
  total: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => User)
  createdBy: User;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  @Field(() => Company)
  company: Company;

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop()
  @Field(() => Int)
  updatedAt: number;
}

export const EditedInvoiceSchema = SchemaFactory.createForClass(Invoice);
