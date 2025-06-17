/** @format */

import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
  Post,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { CreatePostInput, UpdatePostInput } from "./dto";
import { CurrentUserPayload } from "src/auth/current-user-payload.interface";
import { PostDocument, PostType } from "./schema/post.schema";

@Injectable()
export class PostsService {
  constructor(@InjectModel("Post") private postModel: Model<PostDocument>) {}

  async create(
    createPostInput: CreatePostInput,
    user: CurrentUserPayload
  ): Promise<PostDocument> {
    // Validate content based on type
    this.validatePostContent(createPostInput);

    const postData = {
      ...createPostInput,
      authorId: new Types.ObjectId(user.id),
    };

    const createdPost = new this.postModel(postData);
    return createdPost.save();
  }

  async findAll(user: CurrentUserPayload): Promise<PostDocument[]> {
    if (!user || !user.roles) {
      throw new Error("User or user roles are undefined");
    }

    // Super admins can see all posts
    if (user.roles.includes("SUPER_ADMIN")) {
      return this.postModel
        .find({ isActive: true })
        .populate("authorId")
        .exec();
    }

    // Regular users and admins see all active posts
    return this.postModel.find({ isActive: true }).populate("authorId").exec();
  }

  async findByAuthor(
    authorId: string,
    user: CurrentUserPayload
  ): Promise<PostDocument[]> {
    // Users can see their own posts (including inactive ones)
    if (user.id === authorId) {
      return this.postModel
        .find({ authorId: new Types.ObjectId(authorId) })
        .populate("authorId")
        .exec();
    }

    // Others can only see active posts
    return this.postModel
      .find({
        authorId: new Types.ObjectId(authorId),
        isActive: true,
      })
      .populate("authorId")
      .exec();
  }

  async findById(id: string): Promise<PostDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid post ID");
    }

    const post = await this.postModel.findById(id).populate("authorId").exec();
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    return post;
  }

  async update(
    id: string,
    updatePostInput: UpdatePostInput,
    user: CurrentUserPayload
  ): Promise<PostDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid post ID");
    }

    const post = await this.postModel.findById(id).exec();
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    // Only the author or super admin can update the post
    if (
      post.authorId.toString() !== user.id &&
      !user.roles.includes("SUPER_ADMIN")
    ) {
      throw new ConflictException("You can only update your own posts");
    }

    // Validate content if type is being changed
    if (updatePostInput.type) {
      this.validatePostContent({
        type: updatePostInput.type,
        contentUrl: updatePostInput.contentUrl || post.contentUrl,
        textContent: updatePostInput.textContent || post.textContent,
      } as CreatePostInput);
    }

    const updatedPost = await this.postModel
      .findByIdAndUpdate(id, updatePostInput, { new: true })
      .populate("authorId")
      .exec();

    return updatedPost;
  }

  async remove(id: string, user: CurrentUserPayload): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid post ID");
    }

    const post = await this.postModel.findById(id).exec();
    if (!post) {
      throw new NotFoundException("Post not found");
    }

    // Only the author or super admin can delete the post
    if (
      post.authorId.toString() !== user.id &&
      !user.roles.includes("SUPER_ADMIN")
    ) {
      throw new ConflictException("You can only delete your own posts");
    }

    await this.postModel.findByIdAndDelete(id).exec();
  }

  async incrementViewCount(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid post ID");
    }

    await this.postModel
      .findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true })
      .exec();
  }

  private validatePostContent(postInput: CreatePostInput): void {
    const { type, contentUrl, textContent } = postInput;

    switch (type) {
      case PostType.VIDEO:
      case PostType.IMAGE:
        if (!contentUrl) {
          throw new BadRequestException(
            `Content URL is required for ${type} posts`
          );
        }
        if (!this.isValidUrl(contentUrl)) {
          throw new BadRequestException("Invalid content URL format");
        }
        break;

      case PostType.TEXT:
        if (!textContent || textContent.trim().length === 0) {
          throw new BadRequestException(
            "Text content is required for TEXT posts"
          );
        }
        break;

      default:
        throw new BadRequestException("Invalid post type");
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
