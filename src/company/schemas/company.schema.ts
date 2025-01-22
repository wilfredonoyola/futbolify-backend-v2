import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Field, ObjectType, ID, Int } from '@nestjs/graphql';
import { User } from 'src/users/schemas/user.schema';

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class Company extends Document {
  @Field(() => ID)
  get companyId(): string {
    return this._id.toString();
  }

  @Prop({ required: true })
  @Field()
  name: string;

  @Prop({ nullable: true })
  @Field({ nullable: true })
  address?: string;

  @Prop({ type: [{ type: 'ObjectId', ref: 'User' }] })
  @Field(() => [User], { nullable: 'itemsAndList' })
  members?: User[];

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop()
  @Field(() => Int)
  updatedAt: number;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
