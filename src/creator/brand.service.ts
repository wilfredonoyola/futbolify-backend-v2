import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Brand } from './schemas/brand.schema';
import { BrandMember, BrandMemberDocument, BrandMemberRole } from './schemas/brand-member.schema';
import { CreateBrandInput } from './dto/create-brand.input';
import { UpdateBrandInput } from './dto/update-brand.input';
import { UsersService } from '../users/users.service';

@Injectable()
export class BrandService {
  constructor(
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
    @InjectModel(BrandMember.name) private brandMemberModel: Model<BrandMemberDocument>,
    @Inject(forwardRef(() => UsersService)) private usersService: UsersService,
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
   * Find all brands for a user (owned or member)
   */
  async findAllByUser(userId: string): Promise<Brand[]> {
    // Get brands owned by user
    const ownedBrands = await this.brandModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();

    // Get brands where user is a member
    const memberships = await this.brandMemberModel.find({
      userId: new Types.ObjectId(userId),
    });
    const memberBrandIds = memberships.map((m) => m.brandId);

    // Filter out brands already owned
    const ownedBrandIds = new Set(ownedBrands.map((b) => b._id.toString()));
    const additionalBrandIds = memberBrandIds.filter(
      (id) => !ownedBrandIds.has(id.toString()),
    );

    // Fetch additional brands
    const memberBrands = await this.brandModel
      .find({ _id: { $in: additionalBrandIds } })
      .sort({ createdAt: -1 })
      .exec();

    // Combine: owned first, then member brands
    return [...ownedBrands, ...memberBrands];
  }

  /**
   * Find active brand for a user (owned or member)
   */
  async findActiveBrand(userId: string): Promise<Brand | null> {
    // First check if user has an activeBrandId set
    const activeBrandId = await this.usersService.getActiveBrandId(userId);

    if (activeBrandId) {
      // Verify user still has access to this brand
      const hasAccess = await this.hasAccess(activeBrandId, userId);
      if (hasAccess) {
        const brand = await this.brandModel.findById(activeBrandId).exec();
        if (brand) {
          return brand;
        }
      }
      // If no access or brand not found, clear the activeBrandId
      await this.usersService.clearActiveBrandId(userId);
    }

    // Fallback: try to find an active owned brand (legacy support)
    const activeBrand = await this.brandModel
      .findOne({
        userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .exec();

    if (activeBrand) {
      // Set this as the user's activeBrandId for future use
      await this.usersService.setActiveBrandId(userId, activeBrand._id.toString());
      return activeBrand;
    }

    // If no active brand, return the first owned brand
    const firstOwnedBrand = await this.brandModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();

    if (firstOwnedBrand) {
      await this.usersService.setActiveBrandId(userId, firstOwnedBrand._id.toString());
      return firstOwnedBrand;
    }

    // If no owned brands, return the first member brand
    const memberships = await this.brandMemberModel.find({
      userId: new Types.ObjectId(userId),
    });

    if (memberships.length > 0) {
      const memberBrand = await this.brandModel.findById(memberships[0].brandId).exec();
      if (memberBrand) {
        await this.usersService.setActiveBrandId(userId, memberBrand._id.toString());
        return memberBrand;
      }
    }

    return null;
  }

  /**
   * Find brand by ID (user must be owner or member)
   */
  async findOne(id: string, userId: string): Promise<Brand> {
    const brand = await this.brandModel.findById(id).exec();

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${id} not found`);
    }

    // Check if user is owner
    if (brand.userId.toString() === userId) {
      return brand;
    }

    // Check if user is a member
    const membership = await this.brandMemberModel.findOne({
      brandId: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this brand');
    }

    return brand;
  }

  /**
   * Check if user has access to a brand
   */
  async hasAccess(brandId: string, userId: string): Promise<boolean> {
    const brand = await this.brandModel.findById(brandId).exec();
    if (!brand) return false;

    // Check if owner
    if (brand.userId.toString() === userId) {
      return true;
    }

    // Check membership
    const membership = await this.brandMemberModel.findOne({
      brandId: new Types.ObjectId(brandId),
      userId: new Types.ObjectId(userId),
    });

    return !!membership;
  }

  /**
   * Get user's role in a brand
   */
  async getUserRole(brandId: string, userId: string): Promise<BrandMemberRole | null> {
    const brand = await this.brandModel.findById(brandId).exec();
    if (!brand) return null;

    // Check if owner
    if (brand.userId.toString() === userId) {
      return BrandMemberRole.OWNER;
    }

    // Check membership
    const membership = await this.brandMemberModel.findOne({
      brandId: new Types.ObjectId(brandId),
      userId: new Types.ObjectId(userId),
    });

    return membership?.role || null;
  }

  /**
   * Update a brand (owner or editor can update)
   */
  async update(userId: string, updateBrandInput: UpdateBrandInput): Promise<Brand> {
    const { id, ...updateData } = updateBrandInput;

    // Check if user has edit access
    const role = await this.getUserRole(id, userId);
    if (!role || role === BrandMemberRole.VIEWER) {
      throw new ForbiddenException('You do not have permission to edit this brand');
    }

    // If setting as active, deactivate other brands for this user
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
      .findByIdAndUpdate(
        id,
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
   * Set a brand as active (user must have access)
   */
  async setActive(userId: string, brandId: string): Promise<Brand> {
    // Verify user has access to this brand
    const hasAccess = await this.hasAccess(brandId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this brand');
    }

    const brand = await this.brandModel.findById(brandId).exec();

    if (!brand) {
      throw new NotFoundException(`Brand with ID ${brandId} not found`);
    }

    // Update the user's activeBrandId (works for both owners and members)
    await this.usersService.setActiveBrandId(userId, brandId);

    // Also update isActive flag on brands for owners (legacy support)
    if (brand.userId.toString() === userId) {
      // Deactivate all owned brands for this user
      await this.brandModel.updateMany(
        { userId: new Types.ObjectId(userId) },
        { isActive: false },
      );
      // Activate the selected brand
      brand.isActive = true;
      await brand.save();
    }

    return brand;
  }

  /**
   * Delete a brand (owner only)
   */
  async remove(id: string, userId: string): Promise<boolean> {
    // Only owner can delete
    const brand = await this.brandModel.findById(id).exec();
    if (!brand) {
      throw new NotFoundException(`Brand with ID ${id} not found`);
    }

    if (brand.userId.toString() !== userId) {
      throw new ForbiddenException('Only the brand owner can delete this brand');
    }

    // Delete all members
    await this.brandMemberModel.deleteMany({
      brandId: new Types.ObjectId(id),
    });

    // Delete the brand
    await this.brandModel.deleteOne({ _id: new Types.ObjectId(id) });

    return true;
  }

  /**
   * Check if user has any brands (owned or member)
   */
  async hasBrands(userId: string): Promise<boolean> {
    // Check owned brands
    const ownedCount = await this.brandModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .exec();

    if (ownedCount > 0) {
      return true;
    }

    // Check member brands
    const memberCount = await this.brandMemberModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .exec();

    return memberCount > 0;
  }
}
