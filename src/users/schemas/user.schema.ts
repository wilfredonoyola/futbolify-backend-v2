/** @format */

import { registerEnumType, Field, ObjectType, ID, Int } from "@nestjs/graphql";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import { Company } from "src/company/schemas/company.schema";

export type UserDocument = User & Document;

export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN",
}

// Register the enum with GraphQL
registerEnumType(UserRole, {
  name: "UserRole",
  description: "The roles a user can have in the system",
});

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class User extends Document {
  @Field(() => ID)
  get userId(): string {
    return this._id.toString();
  }

  @Prop({ required: true, unique: true })
  @Field()
  email: string;

  @Prop({ required: true })
  @Field()
  phone: string;

  @Prop({ required: false })
  @Field({ nullable: true })
  password?: string;

  @Prop({ type: [String], enum: UserRole, default: [UserRole.USER] })
  @Field(() => [UserRole])
  roles: UserRole[];

  @Prop({ required: false, default: false })
  @Field(() => Boolean, { defaultValue: false })
  isOnboardingCompleted?: boolean;

  // Relación opcional con Company
  @Prop({
    type: "ObjectId",
    ref: "Company",
    required: function () {
      // Solo se requiere si no es SUPER_ADMIN
      return !this.roles.includes(UserRole.SUPER_ADMIN);
    },
  })
  @Field(() => Company, { nullable: true })
  company?: Company;

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop()
  @Field(() => Int)
  updatedAt: number;

  @Prop({ required: false })
  name?: string;

  @Prop({ required: false })
  @Field({ nullable: true })
  birthday?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
