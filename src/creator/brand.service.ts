import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Brand } from './schemas/brand.schema';
import { CreateBrandInput } from './dto/create-brand.input';
import { UpdateBrandInput } from './dto/update-brand.input';

@Injectable()
export class BrandService {
  constructor(
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
  ) {}

  /**
   * Create a new brand for a user
   */
  async create(userId: string, createBrandInput: CreateBrandInput): Promise<Brand> {
    const brand = new this.brandModel({
      ...createBrandInput,
      userId: new Types.ObjectId(userId),
    });

    // If this is set as active, deactivate other brands for this user
    if (createBrandInput.isActive) {
      await this.brandModel.updateMany(
        { userId: new Types.ObjectId(userId) },
        { isActive: false },
      );
    }

    return brand.save();
  }

  /**
   * Find all brands for a user
   */
  async findAllByUser(userId: string): Promise<Brand[]> {
    return this.brandModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find active brand for a user
   */
  async findActiveBrand(userId: string): Promise<Brand | null> {
    const activeBrand = await this.brandModel
      .findOne({ 
        userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .exec();

    // If no active brand, return the first one
    if (!activeBrand) {
      return this.brandModel
        .findOne({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .exec();
    }

    return activeBrand;
  }

  /**
   * Find brand by ID
   */
  async findOne(id: string, userId: string): Promise<Brand> {
    const brand = await this.brandModel
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${id} not found`);
    }

    return brand;
  }

  /**
   * Update a brand
   */
  async update(userId: string, updateBrandInput: UpdateBrandInput): Promise<Brand> {
    const { id, ...updateData } = updateBrandInput;

    // If setting as active, deactivate other brands
    if (updateData.isActive) {
      await this.brandModel.updateMany(
        { 
          userId: new Types.ObjectId(userId),
          _id: { $ne: new Types.ObjectId(id) },
        },
        { isActive: false },
      );
    }

    const brand = await this.brandModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          userId: new Types.ObjectId(userId),
        },
        { $set: updateData },
        { new: true },
      )
      .exec();

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${id} not found`);
    }

    return brand;
  }

  /**
   * Set a brand as active
   */
  async setActive(userId: string, brandId: string): Promise<Brand> {
    // Deactivate all brands for this user
    await this.brandModel.updateMany(
      { userId: new Types.ObjectId(userId) },
      { isActive: false },
    );

    // Activate the specified brand
    const brand = await this.brandModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(brandId),
          userId: new Types.ObjectId(userId),
        },
        { isActive: true },
        { new: true },
      )
      .exec();

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${brandId} not found`);
    }

    return brand;
  }

  /**
   * Delete a brand
   */
  async remove(id: string, userId: string): Promise<boolean> {
    const result = await this.brandModel
      .deleteOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException(`Brand with ID ${id} not found`);
    }

    return true;
  }

  /**
   * Check if user has any brands
   */
  async hasBrands(userId: string): Promise<boolean> {
    const count = await this.brandModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .exec();

    return count > 0;
  }
}
