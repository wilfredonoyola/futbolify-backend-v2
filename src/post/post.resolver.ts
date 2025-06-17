/** @format */

import { Resolver, Query, Args, Mutation } from "@nestjs/graphql";

import { UserRole } from "../users/schemas/user.schema";
import { UseGuards, SetMetadata } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";

import { CurrentUser } from "src/auth/current-user.decorator";
import { CurrentUserPayload } from "src/auth/current-user-payload.interface";
import { GqlAuthGuard } from "src/auth/gql-auth.guard";
import { CreatePostInput, PostOutputDto, UpdatePostInput } from "./dto";
import { PostsService } from "./post.service";

export const Roles = (...roles: UserRole[]) => SetMetadata("roles", roles);

@Resolver(() => PostOutputDto)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Mutation(() => PostOutputDto)
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async createPost(
    @Args("createPostInput") createPostInput: CreatePostInput,
    @CurrentUser() currentUser: CurrentUserPayload
  ): Promise<PostOutputDto> {
    const post = await this.postsService.create(createPostInput, currentUser);
    return this.mapPostToDto(post);
  }

  @Query(() => [PostOutputDto])
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async posts(
    @CurrentUser() currentUser: CurrentUserPayload
  ): Promise<PostOutputDto[]> {
    if (!currentUser) {
      throw new Error("User is not defined");
    }

    try {
      const posts = await this.postsService.findAll(currentUser);
      return posts.map((post) => this.mapPostToDto(post));
    } catch (error) {
      throw new Error(`Error retrieving posts: ${error.message}`);
    }
  }

  @Query(() => PostOutputDto, { nullable: true })
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async post(
    @Args("id") id: string,
    @CurrentUser() currentUser: CurrentUserPayload
  ): Promise<PostOutputDto | null> {
    try {
      const post = await this.postsService.findById(id);

      // Increment view count when someone views the post
      await this.postsService.incrementViewCount(id);

      return this.mapPostToDto(post);
    } catch (error) {
      return null;
    }
  }

  @Query(() => [PostOutputDto])
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async postsByAuthor(
    @Args("authorId") authorId: string,
    @CurrentUser() currentUser: CurrentUserPayload
  ): Promise<PostOutputDto[]> {
    try {
      const posts = await this.postsService.findByAuthor(authorId, currentUser);
      return posts.map((post) => this.mapPostToDto(post));
    } catch (error) {
      throw new Error(`Error retrieving posts by author: ${error.message}`);
    }
  }

  @Mutation(() => PostOutputDto)
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async updatePost(
    @Args("id") id: string,
    @Args("updatePostInput") updatePostInput: UpdatePostInput,
    @CurrentUser() currentUser: CurrentUserPayload
  ): Promise<PostOutputDto> {
    const updatedPost = await this.postsService.update(
      id,
      updatePostInput,
      currentUser
    );
    return this.mapPostToDto(updatedPost);
  }

  @Mutation(() => Boolean)
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async removePost(
    @Args("id") id: string,
    @CurrentUser() currentUser: CurrentUserPayload
  ): Promise<boolean> {
    await this.postsService.remove(id, currentUser);
    return true;
  }

  @Mutation(() => Boolean)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseGuards(GqlAuthGuard, RolesGuard)
  async togglePostStatus(
    @Args("id") id: string,
    @CurrentUser() currentUser: CurrentUserPayload
  ): Promise<boolean> {
    const post = await this.postsService.findById(id);
    await this.postsService.update(
      id,
      { isActive: !post.isActive },
      currentUser
    );
    return true;
  }

  private mapPostToDto(post: any): PostOutputDto {
    return {
      id: post._id.toString(),
      title: post.title,
      description: post.description,
      type: post.type,
      contentUrl: post.contentUrl,
      textContent: post.textContent,
      authorId: post.authorId.toString(),
      isActive: post.isActive,
      viewCount: post.viewCount,
      tags: post.tags,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }
}
