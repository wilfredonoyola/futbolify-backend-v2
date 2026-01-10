import { Field, ObjectType, ID, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeamMemberDocument = TeamMember & Document;

export enum MemberRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

registerEnumType(MemberRole, {
  name: 'MemberRole',
  description: 'Role of a member in a team',
});

@Schema({ timestamps: false })
@ObjectType()
export class TeamMember extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Team', required: true })
  @Field(() => ID)
  teamId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  userId: Types.ObjectId;

  @Prop({ type: String, enum: MemberRole, default: MemberRole.MEMBER })
  @Field(() => MemberRole)
  role: MemberRole;

  @Prop({ type: Date, default: Date.now })
  @Field(() => Date)
  joinedAt: Date;
}

export const TeamMemberSchema = SchemaFactory.createForClass(TeamMember);

// Composite unique index to prevent duplicate memberships
TeamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });
TeamMemberSchema.index({ userId: 1 });
TeamMemberSchema.index({ teamId: 1, role: 1 });

