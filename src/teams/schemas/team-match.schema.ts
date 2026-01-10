import { Field, ObjectType, ID, Int } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeamMatchDocument = TeamMatch & Document;

@Schema({ timestamps: true })
@ObjectType()
export class TeamMatch extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Team', required: true })
  @Field(() => ID)
  teamId: Types.ObjectId;

  @Prop({ required: true })
  @Field(() => Date)
  date: Date;

  @Prop({ required: false })
  @Field({ nullable: true })
  opponent?: string;

  @Prop({ required: false })
  @Field({ nullable: true })
  location?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  @Field(() => ID)
  createdBy: Types.ObjectId;

  @Prop()
  @Field(() => Date)
  createdAt: Date;

  @Prop()
  @Field(() => Date)
  updatedAt: Date;

  // Virtual fields for stats
  @Field(() => Int, { nullable: true })
  photoCount?: number;

  @Field(() => Int, { nullable: true })
  videoCount?: number;

  @Field(() => Int, { nullable: true })
  highlightCount?: number;
}

export const TeamMatchSchema = SchemaFactory.createForClass(TeamMatch);

// Indexes for queries
TeamMatchSchema.index({ teamId: 1 });
TeamMatchSchema.index({ date: -1 });
TeamMatchSchema.index({ createdBy: 1 });

