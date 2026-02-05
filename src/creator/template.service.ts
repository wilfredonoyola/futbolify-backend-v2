import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Template } from './schemas/template.schema';
import { CreateTemplateInput } from './dto/create-template.input';
import { UpdateTemplateInput } from './dto/update-template.input';
import { BunnyStorageService } from '../bunny/bunny-storage.service';

@Injectable()
export class TemplateService {
  constructor(
    @InjectModel(Template.name) private templateModel: Model<Template>,
    private readonly bunnyStorageService: BunnyStorageService,
  ) {}

  /**
   * Extract CDN image paths from template data
   * Looks for URLs matching our CDN hostname pattern
   */
  private extractImagePaths(templateData: Record<string, any>): string[] {
    const paths: string[] = [];
    const cdnPattern = /templates\/(images|thumbnails)\/[^?\s"']+/g;

    const searchForPaths = (obj: any) => {
      if (typeof obj === 'string') {
        const matches = obj.match(cdnPattern);
        if (matches) {
          paths.push(...matches);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(searchForPaths);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(searchForPaths);
      }
    };

    searchForPaths(templateData);
    return [...new Set(paths)]; // Remove duplicates
  }

  /**
   * Create a new template
   */
  async create(userId: string, createTemplateInput: CreateTemplateInput): Promise<Template> {
    const template = new this.templateModel({
      ...createTemplateInput,
      userId: new Types.ObjectId(userId),
      brandId: createTemplateInput.brandId 
        ? new Types.ObjectId(createTemplateInput.brandId)
        : undefined,
    });

    return template.save();
  }

  /**
   * Find all templates for a user
   */
  async findAllByUser(userId: string, category?: string): Promise<Template[]> {
    const filter: any = { userId: new Types.ObjectId(userId) };
    
    if (category) {
      filter.category = category;
    }

    return this.templateModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();
  }

  /**
   * Find templates by brand
   */
  async findByBrand(userId: string, brandId: string): Promise<Template[]> {
    return this.templateModel
      .find({
        userId: new Types.ObjectId(userId),
        brandId: new Types.ObjectId(brandId),
      })
      .sort({ updatedAt: -1 })
      .exec();
  }

  /**
   * Find preset templates (public templates created by admin)
   */
  async findPresets(category?: string): Promise<Template[]> {
    const filter: any = { isPreset: true, isPublished: true };
    
    if (category) {
      filter.category = category;
    }

    return this.templateModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find template by ID
   */
  async findOne(id: string, userId: string): Promise<Template> {
    const template = await this.templateModel
      .findOne({
        _id: new Types.ObjectId(id),
        $or: [
          { userId: new Types.ObjectId(userId) },
          { isPreset: true, isPublished: true },
        ],
      })
      .exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    return template;
  }

  /**
   * Find template by preset ID
   */
  async findByPresetId(presetId: string): Promise<Template | null> {
    return this.templateModel
      .findOne({
        presetId,
        isPreset: true,
        isPublished: true,
      })
      .exec();
  }

  /**
   * Update a template
   * Also handles cleanup of removed images from CDN
   * Note: Presets (isPreset: true) can be updated by anyone (temporary for editing library templates)
   */
  async update(userId: string, updateTemplateInput: UpdateTemplateInput): Promise<Template> {
    const { id, ...updateData } = updateTemplateInput;

    // Get the existing template first (without userId filter to check if it's a preset)
    const existingTemplate = await this.templateModel
      .findOne({
        _id: new Types.ObjectId(id),
      })
      .exec();

    if (!existingTemplate) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // If not a preset, verify ownership
    if (!existingTemplate.isPreset) {
      const isOwner = existingTemplate.userId?.toString() === userId;
      if (!isOwner) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }
    }

    // Extract current image paths from old data
    const oldImagePaths = existingTemplate.imageAssets || [];

    // Extract new image paths from updated templateData
    let newImagePaths: string[] = [];
    if (updateData.templateData) {
      newImagePaths = this.extractImagePaths(updateData.templateData);
      // Also check thumbnail if present
      if (updateData.thumbnail && updateData.thumbnail.includes('templates/thumbnails/')) {
        const thumbnailMatch = updateData.thumbnail.match(/templates\/thumbnails\/[^?\s"']+/);
        if (thumbnailMatch) {
          newImagePaths.push(thumbnailMatch[0]);
        }
      }
    }

    // Find images that were removed (in old but not in new)
    const removedPaths = oldImagePaths.filter(
      (path) => !newImagePaths.includes(path),
    );

    // Delete removed images from CDN (async, don't wait)
    if (removedPaths.length > 0) {
      console.log(`[Template] Cleaning up ${removedPaths.length} removed images for template ${id}`);
      this.bunnyStorageService.deleteTemplateImages(removedPaths).catch((err) => {
        console.error('[Template] Error cleaning up images:', err);
      });
    }

    // Update template with new data and image paths
    const template = await this.templateModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
        },
        {
          $set: {
            ...updateData,
            imageAssets: newImagePaths,
          },
        },
        { new: true },
      )
      .exec();

    return template;
  }

  /**
   * Duplicate a template
   */
  async duplicate(userId: string, templateId: string, newName?: string): Promise<Template> {
    const original = await this.findOne(templateId, userId);

    const duplicated = new this.templateModel({
      userId: new Types.ObjectId(userId),
      brandId: original.brandId,
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      category: original.category,
      thumbnail: original.thumbnail,
      width: original.width,
      height: original.height,
      backgroundColor: original.backgroundColor,
      templateData: original.templateData,
      tags: original.tags,
      isPublished: false, // Duplicated templates are private by default
      isPreset: false,
    });

    return duplicated.save();
  }

  /**
   * Delete a template and clean up all associated images from CDN
   */
  async remove(id: string, userId: string): Promise<boolean> {
    // First, get the template to retrieve image paths
    const template = await this.templateModel
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Get all image paths to delete
    const pathsToDelete: string[] = [...(template.imageAssets || [])];

    // Also add the thumbnail path
    const thumbnailPath = `templates/thumbnails/${id}.png`;
    pathsToDelete.push(thumbnailPath);
    // Try other formats too
    pathsToDelete.push(`templates/thumbnails/${id}.jpg`);
    pathsToDelete.push(`templates/thumbnails/${id}.webp`);

    // Delete the template from database
    const result = await this.templateModel
      .deleteOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Clean up images from CDN (async, don't block)
    if (pathsToDelete.length > 0) {
      console.log(`[Template] Cleaning up ${pathsToDelete.length} images for deleted template ${id}`);
      this.bunnyStorageService.deleteTemplateImages(pathsToDelete).catch((err) => {
        console.error('[Template] Error cleaning up images on delete:', err);
      });
    }

    return true;
  }

  /**
   * Search templates by tags or name
   */
  async search(userId: string, query: string): Promise<Template[]> {
    const searchRegex = new RegExp(query, 'i');

    return this.templateModel
      .find({
        $and: [
          {
            $or: [
              { userId: new Types.ObjectId(userId) },
              { isPreset: true, isPublished: true },
            ],
          },
          {
            $or: [
              { name: searchRegex },
              { description: searchRegex },
              { tags: searchRegex },
            ],
          },
        ],
      })
      .sort({ updatedAt: -1 })
      .exec();
  }

  // ==================== Mis Diseños Feature ====================

  /**
   * Find user's private designs (type='design')
   */
  async findUserDesigns(userId: string): Promise<Template[]> {
    return this.templateModel
      .find({
        userId: new Types.ObjectId(userId),
        type: 'design',
      })
      .sort({ updatedAt: -1 })
      .exec();
  }

  /**
   * Find system preset templates by category
   */
  async findPresetsByCategory(category?: string): Promise<Template[]> {
    const filter: any = { isPreset: true };

    if (category) {
      filter.presetCategory = category;
    }

    return this.templateModel.find(filter).sort({ name: 1 }).exec();
  }

  /**
   * Find templates published by users (not system presets)
   */
  async findPublishedTemplates(category?: string): Promise<Template[]> {
    const filter: any = {
      isPublished: true,
      isPreset: false,
    };

    if (category) {
      filter.category = category;
    }

    return this.templateModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /**
   * Publish a user design as a public template
   */
  async publishAsTemplate(
    designId: string,
    userId: string,
    thumbnailUrl: string,
  ): Promise<Template> {
    const design = await this.templateModel.findOne({
      _id: new Types.ObjectId(designId),
      userId: new Types.ObjectId(userId),
    });

    if (!design) {
      throw new NotFoundException(`Design with ID ${designId} not found`);
    }

    design.isPublished = true;
    design.type = 'template';
    design.thumbnail = thumbnailUrl;

    return design.save();
  }
}
