import { Field, ObjectType, ID, Int, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeamDocument = Team & Document;

export enum TeamColor {
  GREEN = 'GREEN',
  BLUE = 'BLUE',
  RED = 'RED',
  YELLOW = 'YELLOW',
  PURPLE = 'PURPLE',
  ORANGE = 'ORANGE',
  PINK = 'PINK',
  BLACK = 'BLACK',
  WHITE = 'WHITE',
}

registerEnumType(TeamColor, {
  name: 'TeamColor',
  description: 'Available team colors',
});

@Schema({ timestamps: true })
@ObjectType()
export class Team extends Document {
  @Field(() => ID, { name: 'id' })
  _id: Types.ObjectId;

  @Prop({ required: true })
  @Field()
  name: string;

  @Prop({ type: String, enum: TeamColor, required: true })
  @Field(() => TeamColor)
  color: TeamColor;

  @Prop({ required: true, unique: true, uppercase: true, length: 6 })
  @Field()
  code: string;

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
  matchCount?: number;

  @Field(() => Int, { nullable: true })
  mediaCount?: number;

  @Field(() => Int, { nullable: true })
  memberCount?: number;
}

export const TeamSchema = SchemaFactory.createForClass(Team);

// Index for unique code
TeamSchema.index({ code: 1 }, { unique: true });
TeamSchema.index({ createdBy: 1 });

// Pre-save middleware to generate unique code
TeamSchema.pre('save', async function (next) {
  if (!this.code) {
    let code: string;
    let exists = true;
    
    while (exists) {
      // Generate 6-character alphanumeric code
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const Team = this.constructor as any;
      const found = await Team.findOne({ code });
      exists = !!found;
    }
    
    this.code = code;
  }
  next();
});

