import { Resolver, Query, Mutation, Args, ID, ObjectType, Field, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Template } from './schemas/template.schema';
import { TemplateService } from './template.service';
import { CreateTemplateInput } from './dto/create-template.input';
import { UpdateTemplateInput } from './dto/update-template.input';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BunnyStorageService } from '../bunny/bunny-storage.service';

// Output type for thumbnail upload
@ObjectType()
class ThumbnailUploadResult {
  @Field()
  url: string;

  @Field()
  cdnUrl: string;

  @Field()
  path: string;
}

@Resolver(() => Template)
@UseGuards(GqlAuthGuard)
export class TemplateResolver {
  constructor(
    private readonly templateService: TemplateService,
    private readonly bunnyStorageService: BunnyStorageService,
  ) {}

  @Mutation(() => Template)
  async createTemplate(
    @CurrentUser() user: any,
    @Args('input') createTemplateInput: CreateTemplateInput,
  ): Promise<Template> {
    return this.templateService.create(user.userId, createTemplateInput);
  }

  @Query(() => [Template])
  async myTemplates(
    @CurrentUser() user: any,
    @Args('category', { nullable: true }) category?: string,
  ): Promise<Template[]> {
    return this.templateService.findAllByUser(user.userId, category);
  }

  @Query(() => [Template])
  async brandTemplates(
    @CurrentUser() user: any,
    @Args('brandId', { type: () => ID }) brandId: string,
  ): Promise<Template[]> {
    return this.templateService.findByBrand(user.userId, brandId);
  }

  @Query(() => [Template])
  async presetTemplates(
    @Args('category', { nullable: true }) category?: string,
  ): Promise<Template[]> {
    return this.templateService.findPresets(category);
  }

  @Query(() => Template)
  async template(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Template> {
    return this.templateService.findOne(id, user.userId);
  }

  @Query(() => Template, { nullable: true })
  async templateByPresetId(
    @Args('presetId') presetId: string,
  ): Promise<Template | null> {
    return this.templateService.findByPresetId(presetId);
  }

  @Mutation(() => Template)
  async updateTemplate(
    @CurrentUser() user: any,
    @Args('input') updateTemplateInput: UpdateTemplateInput,
  ): Promise<Template> {
    return this.templateService.update(user.userId, updateTemplateInput);
  }

  @Mutation(() => Template)
  async duplicateTemplate(
    @CurrentUser() user: any,
    @Args('templateId', { type: () => ID }) templateId: string,
    @Args('newName', { nullable: true }) newName?: string,
  ): Promise<Template> {
    return this.templateService.duplicate(user.userId, templateId, newName);
  }

  @Mutation(() => Boolean)
  async deleteTemplate(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.templateService.remove(id, user.userId);
  }

  @Query(() => [Template])
  async searchTemplates(
    @CurrentUser() user: any,
    @Args('query') query: string,
  ): Promise<Template[]> {
    return this.templateService.search(user.userId, query);
  }

  // ==================== Mis Diseños Feature ====================

  /**
   * Get user's private designs (type='design')
   * These are work-in-progress designs
   */
  @Query(() => [Template])
  async myDesigns(@CurrentUser() user: any): Promise<Template[]> {
    return this.templateService.findUserDesigns(user.userId);
  }

  /**
   * Get user's private templates (type='template', isPublished=false)
   * These are reusable templates saved by the user
   */
  @Query(() => [Template])
  async myPrivateTemplates(@CurrentUser() user: any): Promise<Template[]> {
    return this.templateService.findMyPrivateTemplates(user.userId);
  }

  /**
   * Get system preset templates by category
   * Uses presetCategory field for filtering
   */
  @Query(() => [Template])
  async presetsByCategory(
    @Args('category', { nullable: true }) category?: string,
  ): Promise<Template[]> {
    return this.templateService.findPresetsByCategory(category);
  }

  /**
   * Get templates published by users (community templates, not system presets)
   */
  @Query(() => [Template])
  async communityTemplates(
    @Args('category', { nullable: true }) category?: string,
  ): Promise<Template[]> {
    return this.templateService.findCommunityTemplates(category);
  }

  /**
   * Get templates published by users (community templates)
   * @deprecated Use communityTemplates instead
   */
  @Query(() => [Template])
  async publishedTemplates(
    @Args('category', { nullable: true }) category?: string,
  ): Promise<Template[]> {
    return this.templateService.findPublishedTemplates(category);
  }

  /**
   * Save a design as a private reusable template
   */
  @Mutation(() => Template)
  async saveAsMyTemplate(
    @CurrentUser() user: any,
    @Args('designId', { type: () => ID }) designId: string,
    @Args('thumbnailUrl') thumbnailUrl: string,
  ): Promise<Template> {
    return this.templateService.saveAsMyTemplate(
      designId,
      user.userId,
      thumbnailUrl,
    );
  }

  /**
   * Publish a user design/template as a public community template
   */
  @Mutation(() => Template)
  async publishAsTemplate(
    @CurrentUser() user: any,
    @Args('designId', { type: () => ID }) designId: string,
    @Args('thumbnailUrl') thumbnailUrl: string,
  ): Promise<Template> {
    return this.templateService.publishAsTemplate(
      designId,
      user.userId,
      thumbnailUrl,
    );
  }

  /**
   * Unpublish a template (make it private again)
   */
  @Mutation(() => Template)
  async unpublishTemplate(
    @CurrentUser() user: any,
    @Args('templateId', { type: () => ID }) templateId: string,
  ): Promise<Template> {
    return this.templateService.unpublishTemplate(templateId, user.userId);
  }

  // ==================== Thumbnail Upload ====================

  /**
   * Upload a template thumbnail to CDN
   * Accepts base64 encoded image data (with or without data URL prefix)
   * Returns the CDN URL for use in publishAsTemplate or template thumbnail
   */
  @Mutation(() => ThumbnailUploadResult)
  async uploadTemplateThumbnail(
    @CurrentUser() user: any,
    @Args('base64Data') base64Data: string,
    @Args('templateId', { type: () => ID }) templateId: string,
    @Args('format', { nullable: true, defaultValue: 'png' }) format: string,
  ): Promise<ThumbnailUploadResult> {
    // Validate format
    const validFormats = ['png', 'jpg', 'webp'];
    const normalizedFormat = format.toLowerCase() as 'png' | 'jpg' | 'webp';
    if (!validFormats.includes(normalizedFormat)) {
      throw new Error(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
    }

    // Upload to Bunny CDN
    const result = await this.bunnyStorageService.uploadTemplateThumbnail(
      base64Data,
      templateId,
      normalizedFormat,
    );

    return {
      url: result.url,
      cdnUrl: result.cdnUrl,
      path: result.path,
    };
  }

  /**
   * Upload a template image (background, element) to CDN
   * Accepts base64 encoded image data
   * Returns the CDN URL
   */
  @Mutation(() => ThumbnailUploadResult)
  async uploadTemplateImage(
    @CurrentUser() user: any,
    @Args('base64Data') base64Data: string,
    @Args('templateId', { type: () => ID }) templateId: string,
    @Args('imageId') imageId: string,
    @Args('format', { nullable: true, defaultValue: 'jpg' }) format: string,
  ): Promise<ThumbnailUploadResult> {
    // Validate format
    const validFormats = ['png', 'jpg', 'webp'];
    const normalizedFormat = format.toLowerCase() as 'png' | 'jpg' | 'webp';
    if (!validFormats.includes(normalizedFormat)) {
      throw new Error(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
    }

    // Upload to Bunny CDN
    const result = await this.bunnyStorageService.uploadTemplateImage(
      base64Data,
      templateId,
      imageId,
      normalizedFormat,
    );

    return {
      url: result.url,
      cdnUrl: result.cdnUrl,
      path: result.path,
    };
  }

  // ==================== Image Cleanup ====================

  /**
   * Delete a specific template image from CDN
   * Used when user removes an image from their design
   */
  @Mutation(() => Boolean)
  async deleteTemplateImage(
    @CurrentUser() user: any,
    @Args('path') path: string,
    @Args('templateId', { type: () => ID }) templateId: string,
  ): Promise<boolean> {
    // Verify user owns this template
    const template = await this.templateService.findOne(templateId, user.userId);
    if (!template) {
      throw new Error('Template not found or access denied');
    }

    // Only allow deleting images that belong to this template
    if (!path.includes(templateId)) {
      throw new Error('Cannot delete images from other templates');
    }

    // Delete from CDN
    const deleted = await this.bunnyStorageService.deleteTemplateImage(path);
    return deleted;
  }

  /**
   * Delete multiple template images from CDN
   * Used for batch cleanup
   */
  @Mutation(() => Int)
  async deleteTemplateImages(
    @CurrentUser() user: any,
    @Args('paths', { type: () => [String] }) paths: string[],
    @Args('templateId', { type: () => ID }) templateId: string,
  ): Promise<number> {
    // Verify user owns this template
    const template = await this.templateService.findOne(templateId, user.userId);
    if (!template) {
      throw new Error('Template not found or access denied');
    }

    // Only allow deleting images that belong to this template
    const validPaths = paths.filter((path) => path.includes(templateId));
    if (validPaths.length === 0) {
      return 0;
    }

    // Delete from CDN
    const deletedCount = await this.bunnyStorageService.deleteTemplateImages(validPaths);
    return deletedCount;
  }
}
