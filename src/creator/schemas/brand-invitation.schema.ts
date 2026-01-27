import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BrandMemberRole } from './brand-member.schema';

export type BrandInvitationDocument = BrandInvitation & Document;

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

registerEnumType(InvitationStatus, {
  name: 'InvitationStatus',
  description: 'Status of a brand invitation',
});

@Schema({ timestamps: true })
@ObjectType()
export class BrandInvitation extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Brand', required: true })
  @Field(() => ID)
  brandId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  @Field()
  code: string;

  @Prop()
  @Field({ nullable: true })
  email?: string;

  @Prop({ type: String, enum: BrandMemberRole, required: true })
  @Field(() => BrandMemberRole)
  role: BrandMemberRole;

  @Prop({ type: String, enum: InvitationStatus, default: InvitationStatus.PENDING })
  @Field(() => InvitationStatus)
  status: InvitationStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  @Field(() => ID, { nullable: true })
  acceptedBy?: Types.ObjectId;

  @Prop({ type: Date, required: true })
  @Field(() => Date)
  expiresAt: Date;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}

export const BrandInvitationSchema = SchemaFactory.createForClass(BrandInvitation);

// Indexes
BrandInvitationSchema.index({ code: 1 }, { unique: true });
BrandInvitationSchema.index({ brandId: 1, status: 1 });
BrandInvitationSchema.index({ email: 1, status: 1 });
BrandInvitationSchema.index({ expiresAt: 1 });
