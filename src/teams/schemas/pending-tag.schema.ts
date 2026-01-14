import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Media } from './media.schema';

export type PendingTagDocument = PendingTag & Document;

export enum PendingTagStatus {
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  CANCELLED = 'CANCELLED',
}

registerEnumType(PendingTagStatus, {
  name: 'PendingTagStatus',
  description: 'Status of a pending tag invitation',
});

@Schema({ timestamps: true })
@ObjectType()
export class PendingTag extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Media', required: true })
  @Field(() => ID)
  mediaId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Team', required: true })
  @Field(() => ID)
  teamId: Types.ObjectId;

  @Prop({ required: true })
  @Field()
  name: string;

  @Prop({ required: false })
  @Field({ nullable: true })
  phone?: string;

  @Prop({ required: true, unique: true })
  @Field()
  inviteCode: string;

  @Prop({ type: String, enum: PendingTagStatus, default: PendingTagStatus.PENDING })
  @Field(() => PendingTagStatus)
  status: PendingTagStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  @Field(() => ID, { nullable: true })
  claimedBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  @Field(() => Date, { nullable: true })
  claimedAt?: Date;

  @Prop()
  @Field(() => Date)
  createdAt: Date;

  @Prop()
  @Field(() => Date)
  updatedAt: Date;

  // Virtual fields for GraphQL
  @Field(() => String)
  get inviteUrl(): string {
    return `${process.env.FRONTEND_URL || 'https://futbolify.com'}/invite/${this.inviteCode}`;
  }

  // Relations (populated in resolver)
  @Field(() => Media, { nullable: true })
  media?: Media;

  @Field(() => User, { nullable: true })
  createdByUser?: User;
}

export const PendingTagSchema = SchemaFactory.createForClass(PendingTag);

// Indexes
PendingTagSchema.index({ mediaId: 1 });
PendingTagSchema.index({ teamId: 1 });
PendingTagSchema.index({ inviteCode: 1 }, { unique: true });
PendingTagSchema.index({ phone: 1 });
PendingTagSchema.index({ status: 1 });
PendingTagSchema.index({ createdBy: 1 });
