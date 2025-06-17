/** @format */

import { InputType, Field } from "@nestjs/graphql";
import { PostType } from "../schema/post.schema";

@InputType()
export class CreatePostInput {
  @Field()
  title: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => PostType)
  type: PostType;

  @Field({ nullable: true })
  contentUrl?: string; // Required for VIDEO and IMAGE

  @Field({ nullable: true })
  textContent?: string; // Required for TEXT

  @Field(() => [String], { nullable: true })
  tags?: string[];
}
