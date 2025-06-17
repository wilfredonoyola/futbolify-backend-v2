/** @format */

import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { AuthModule } from "src/auth/auth.module";
import { UsersModule } from "src/users/users.module";
import { RolesGuard } from "src/auth/roles.guard";
import { PostSchema } from "./schema/post.schema";
import { PostsResolver } from "./post.resolver";
import { PostsService } from "./post.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "Post", schema: PostSchema }]),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  providers: [PostsService, PostsResolver, RolesGuard],
  exports: [PostsService],
})
export class PostsModule {}
