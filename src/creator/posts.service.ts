import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, Schema as MongooseSchema } from 'mongoose';
import { Post, PostStatus, PostOrigin } from './schemas/post.schema';
import { GenerationService, GenerationResult } from './generation.service';
import { ContentSuggestion } from './dto/content-suggestion.output';
import { PostFilterInput } from './dto/post.dto';

export interface CreatePostData {
  suggestion: ContentSuggestion;
  generationResult: GenerationResult;
  brandId: string;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    private readonly generationService: GenerationService,
  ) {}

  /**
   * Generate and create a new post from a suggestion
   */
  async generateAndCreate(suggestionId: string, brandId: string): Promise<Post> {
    // Generate the post content
    const { suggestion, result } =
      await this.generationService.generateFromSuggestionId(suggestionId);

    // Create the post
    return this.create({
      suggestion,
      generationResult: result,
      brandId,
    });
  }

  /**
   * Create a new post
   */
  async create(data: CreatePostData): Promise<Post> {
    const { suggestion, generationResult, brandId } = data;

    const post = new this.postModel({
      origin: PostOrigin.REACTIVE,
      brandId: new Types.ObjectId(brandId),
      contentSuggestionId: suggestion.id,
      contentType: suggestion.type,
      priority: suggestion.priority,
      sourceContent: {
        title: suggestion.title,
        description: suggestion.description,
        sourceUrl: suggestion.sourceUrl || '',
        sourceName: suggestion.source || 'Unknown',
        imageUrl: suggestion.imageUrl,
      },
      generatedText: generationResult.text,
      generation: {
        model: generationResult.model,
        promptVersion: generationResult.promptVersion,
        tokensUsed: generationResult.tokensUsed,
        generatedAt: new Date(),
      },
      status: PostStatus.PENDING,
    });

    return post.save();
  }

  /**
   * Find a post by ID
   */
  async findById(id: string): Promise<Post> {
    const post = await this.postModel.findById(id).exec();
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return post;
  }

  /**
   * Find all pending posts for a brand
   */
  async findPendingByBrand(brandId: string): Promise<Post[]> {
    return this.postModel
      .find({
        brandId: new Types.ObjectId(brandId),
        status: PostStatus.PENDING,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find posts by brand with optional filters
   */
  async findByBrand(brandId: string, filter?: PostFilterInput): Promise<Post[]> {
    const query: any = { brandId: new Types.ObjectId(brandId) };

    if (filter?.status) {
      query.status = filter.status;
    }

    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    return this.postModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }

  /**
   * Find posts claimed by a specific user (in progress)
   */
  async findClaimedByUser(userId: string): Promise<Post[]> {
    return this.postModel
      .find({
        claimedBy: new Types.ObjectId(userId),
        status: { $in: [PostStatus.CLAIMED, PostStatus.READY] },
      })
      .sort({ claimedAt: -1 })
      .exec();
  }

  /**
   * Find downloaded posts by a specific user
   */
  async findDownloadedByUser(userId: string): Promise<Post[]> {
    return this.postModel
      .find({
        claimedBy: new Types.ObjectId(userId),
        status: PostStatus.DOWNLOADED,
      })
      .sort({ downloadedAt: -1 })
      .exec();
  }

  /**
   * Claim a post for editing
   */
  async claim(postId: string, userId: string): Promise<Post> {
    const post = await this.findById(postId);

    if (post.status !== PostStatus.PENDING) {
      throw new BadRequestException(
        `Post cannot be claimed. Current status: ${post.status}`,
      );
    }

    post.status = PostStatus.CLAIMED;
    post.claimedBy = new Types.ObjectId(userId) as unknown as MongooseSchema.Types.ObjectId;
    post.claimedAt = new Date();

    return post.save();
  }

  /**
   * Release a claimed post back to pending
   */
  async release(postId: string, userId: string): Promise<Post> {
    const post = await this.findById(postId);

    if (post.status !== PostStatus.CLAIMED) {
      throw new BadRequestException(
        `Post cannot be released. Current status: ${post.status}`,
      );
    }

    if (post.claimedBy?.toString() !== userId) {
      throw new ForbiddenException('You can only release posts you have claimed');
    }

    post.status = PostStatus.PENDING;
    post.claimedBy = undefined;
    post.claimedAt = undefined;
    post.finalText = undefined;

    return post.save();
  }

  /**
   * Update the final text of a claimed post
   */
  async updateContent(
    postId: string,
    userId: string,
    finalText: string,
  ): Promise<Post> {
    const post = await this.findById(postId);

    if (post.status !== PostStatus.CLAIMED) {
      throw new BadRequestException(
        `Post content cannot be updated. Current status: ${post.status}`,
      );
    }

    if (post.claimedBy?.toString() !== userId) {
      throw new ForbiddenException(
        'You can only update posts you have claimed',
      );
    }

    post.finalText = finalText;
    return post.save();
  }

  /**
   * Mark a post as ready for publishing
   */
  async markReady(postId: string, userId: string): Promise<Post> {
    const post = await this.findById(postId);

    if (post.status !== PostStatus.CLAIMED) {
      throw new BadRequestException(
        `Post cannot be marked as ready. Current status: ${post.status}`,
      );
    }

    if (post.claimedBy?.toString() !== userId) {
      throw new ForbiddenException(
        'You can only mark ready posts you have claimed',
      );
    }

    post.status = PostStatus.READY;
    return post.save();
  }

  /**
   * Mark a post as downloaded
   */
  async markDownloaded(postId: string, userId: string): Promise<Post> {
    const post = await this.findById(postId);

    // Allow from CLAIMED or READY status
    if (post.status !== PostStatus.CLAIMED && post.status !== PostStatus.READY) {
      throw new BadRequestException(
        `Post cannot be marked as downloaded. Current status: ${post.status}`,
      );
    }

    if (post.claimedBy?.toString() !== userId) {
      throw new ForbiddenException(
        'You can only mark downloaded posts you have claimed',
      );
    }

    post.status = PostStatus.DOWNLOADED;
    post.downloadedAt = new Date();
    return post.save();
  }

  /**
   * Mark a post as published
   */
  async markPublished(postId: string, userId: string): Promise<Post> {
    const post = await this.findById(postId);

    // Allow from READY or DOWNLOADED status
    if (post.status !== PostStatus.READY && post.status !== PostStatus.DOWNLOADED) {
      throw new BadRequestException(
        `Post cannot be marked as published. Current status: ${post.status}`,
      );
    }

    if (post.claimedBy?.toString() !== userId) {
      throw new ForbiddenException(
        'You can only publish posts you have claimed',
      );
    }

    post.status = PostStatus.PUBLISHED;
    return post.save();
  }

  /**
   * Reject a post
   */
  async reject(postId: string, userId: string, reason?: string): Promise<Post> {
    const post = await this.findById(postId);

    if (
      post.status !== PostStatus.PENDING &&
      post.status !== PostStatus.CLAIMED
    ) {
      throw new BadRequestException(
        `Post cannot be rejected. Current status: ${post.status}`,
      );
    }

    const wasPending = post.status === PostStatus.PENDING;

    // If claimed, only the claimer can reject
    if (
      post.status === PostStatus.CLAIMED &&
      post.claimedBy?.toString() !== userId
    ) {
      throw new ForbiddenException(
        'You can only reject posts you have claimed',
      );
    }

    post.status = PostStatus.REJECTED;
    post.rejectionReason = reason;
    // Record who rejected it if it was pending (not already claimed)
    if (wasPending) {
      post.claimedBy = new Types.ObjectId(userId) as unknown as MongooseSchema.Types.ObjectId;
    }

    return post.save();
  }

  /**
   * Submit feedback for a published post
   */
  async submitFeedback(
    postId: string,
    rating: number,
    notes?: string,
  ): Promise<Post> {
    const post = await this.findById(postId);

    if (post.status !== PostStatus.PUBLISHED) {
      throw new BadRequestException(
        `Feedback can only be submitted for published posts. Current status: ${post.status}`,
      );
    }

    post.feedback = { rating, notes };
    return post.save();
  }

  /**
   * Check if a post already exists for a suggestion
   */
  async existsForSuggestion(
    suggestionId: string,
    brandId: string,
  ): Promise<boolean> {
    const count = await this.postModel.countDocuments({
      contentSuggestionId: suggestionId,
      brandId: new Types.ObjectId(brandId),
    });
    return count > 0;
  }

  /**
   * Save template data for a post (editor state)
   */
  async saveTemplate(
    postId: string,
    userId: string,
    templateData: Record<string, any>,
  ): Promise<Post> {
    const post = await this.findById(postId);

    // Only the user who claimed the post can save template
    if (post.claimedBy?.toString() !== userId) {
      throw new ForbiddenException(
        'You can only save templates for posts you have claimed',
      );
    }

    // Can save template while CLAIMED, READY, or DOWNLOADED
    const allowedStatuses = [
      PostStatus.CLAIMED,
      PostStatus.READY,
      PostStatus.DOWNLOADED,
    ];
    if (!allowedStatuses.includes(post.status)) {
      throw new BadRequestException(
        `Template cannot be saved. Current status: ${post.status}`,
      );
    }

    post.templateData = templateData;
    return post.save();
  }
}
