import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BrandMemberDocument = BrandMember & Document;

export enum BrandMemberRole {
  OWNER = 'OWNER',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

registerEnumType(BrandMemberRole, {
  name: 'BrandMemberRole',
  description: 'Role of a member in a brand',
});

@Schema({ timestamps: false })
@ObjectType()
export class BrandMember extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Brand', required: true })
  @Field(() => ID)
  brandId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: Types.ObjectId;

  @Prop({ type: String, enum: BrandMemberRole, default: BrandMemberRole.VIEWER })
  @Field(() => BrandMemberRole)
  role: BrandMemberRole;

  @Prop({ type: Date, default: Date.now })
  @Field(() => Date)
  joinedAt: Date;
}

export const BrandMemberSchema = SchemaFactory.createForClass(BrandMember);

// Composite unique index to prevent duplicate memberships
BrandMemberSchema.index({ brandId: 1, userId: 1 }, { unique: true });
BrandMemberSchema.index({ userId: 1 });
BrandMemberSchema.index({ brandId: 1, role: 1 });
