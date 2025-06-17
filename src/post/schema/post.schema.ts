/** @format */

import { registerEnumType, Field, ObjectType, ID, Int } from "@nestjs/graphql";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type PostDocument = Post & Document;

export enum PostType {
  VIDEO = "VIDEO",
  IMAGE = "IMAGE",
  TEXT = "TEXT",
}

// Register the enum with GraphQL
registerEnumType(PostType, {
  name: "PostType",
  description: "The types of content a post can have",
});

@Schema({
  timestamps: { currentTime: () => Math.floor(Date.now() / 1000) },
})
@ObjectType()
export class Post extends Document {
  @Field(() => ID)
  get postId(): string {
    return this._id.toString();
  }

  @Prop({ required: true })
  @Field()
  title: string;

  @Prop({ required: false })
  @Field({ nullable: true })
  description?: string;

  @Prop({ required: true, enum: PostType })
  @Field(() => PostType)
  type: PostType;

  @Prop({ required: false })
  @Field({ nullable: true })
  contentUrl?: string; // For VIDEO and IMAGE types

  @Prop({ required: false })
  @Field({ nullable: true })
  textContent?: string; // For TEXT type

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  @Field(() => ID)
  authorId: Types.ObjectId;

  @Prop({ default: true })
  @Field(() => Boolean, { defaultValue: true })
  isActive: boolean;

  @Prop({ default: 0 })
  @Field(() => Int, { defaultValue: 0 })
  viewCount: number;

  @Prop({ type: [String], default: [] })
  @Field(() => [String], { defaultValue: [] })
  tags: string[];

  @Prop()
  @Field(() => Int)
  createdAt: number;

  @Prop()
  @Field(() => Int)
  updatedAt: number;
}

export const PostSchema = SchemaFactory.createForClass(Post);
