import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Template } from './schemas/template.schema';
import { CreateTemplateInput } from './dto/create-template.input';
import { UpdateTemplateInput } from './dto/update-template.input';

@Injectable()
export class TemplateService {
  constructor(
    @InjectModel(Template.name) private templateModel: Model<Template>,
  ) {}

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
   */
  async update(userId: string, updateTemplateInput: UpdateTemplateInput): Promise<Template> {
    const { id, ...updateData } = updateTemplateInput;

    const template = await this.templateModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          userId: new Types.ObjectId(userId),
        },
        { $set: updateData },
        { new: true },
      )
      .exec();

    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

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
   * Delete a template
   */
  async remove(id: string, userId: string): Promise<boolean> {
    const result = await this.templateModel
      .deleteOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Template with ID ${id} not found`);
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
        $or: [
          { userId: new Types.ObjectId(userId) },
          { isPreset: true, isPublished: true },
        ],
        $or: [
          { name: searchRegex },
          { description: searchRegex },
          { tags: searchRegex },
        ],
      })
      .sort({ updatedAt: -1 })
      .exec();
  }
}
