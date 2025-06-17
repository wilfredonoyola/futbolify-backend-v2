/** @format */

import { Field, ObjectType, ID, Int } from "@nestjs/graphql";
import { PostType } from "../schema/post.schema";

@ObjectType()
export class PostOutputDto {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => PostType)
  type: PostType;

  @Field({ nullable: true })
  contentUrl?: string;

  @Field({ nullable: true })
  textContent?: string;

  @Field(() => ID)
  authorId: string;

  @Field(() => Boolean)
  isActive: boolean;

  @Field(() => Int)
  viewCount: number;

  @Field(() => [String])
  tags: string[];

  @Field(() => Int)
  createdAt: number;

  @Field(() => Int)
  updatedAt: number;
}
