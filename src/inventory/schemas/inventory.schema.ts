import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Field, ObjectType, ID, Int, Float } from '@nestjs/graphql';
import { InventoryStatus } from '../enums/status.enum';
import { CategoryOutput } from 'src/category/dto/category.output';
import { Company } from 'src/company/schemas/company.schema';
import { User } from 'src/users/schemas/user.schema';

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class Inventory extends Document {
  @Field(() => ID)
  get inventoryId(): string {
    return this._id.toString();
  }

  @Prop()
  @Field()
  name: string;

  @Prop()
  @Field(() => Int)
  quantity: number;

  @Prop({ nullable: true })
  @Field({ nullable: true })
  description?: string;

  @Prop({ required: false })
  @Field({ nullable: true })
  sku?: string;

  @Prop({ required: true })
  @Field(() => Float)
  price: number;

  @Prop({ nullable: true })
  @Field({ nullable: true })
  purchasePrice?: number;

  @Prop({ default: InventoryStatus.ACTIVE })
  @Field(() => InventoryStatus, {
    nullable: true,
    defaultValue: InventoryStatus.ACTIVE,
  })
  status?: InventoryStatus;

  @Prop({ required: false })
  @Field(() => Int, { nullable: true })
  expirationDate?: number;

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop()
  @Field(() => Int)
  updatedAt: number;

  @Prop({ required: false, type: Types.ObjectId, ref: 'Category' })
  @Field(() => CategoryOutput, { nullable: true })
  category: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  @Field(() => Company)
  company: Company;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => User)
  createdBy: User;
}

export const InventorySchema = SchemaFactory.createForClass(Inventory);
