import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Inventory } from './schemas/inventory.schema';
import { Category } from 'src/category/schemas/category.schema';
import {
  CreateInventoryInput,
  InventoryOutput,
  UpdateInventoryInput,
} from './dto';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(Inventory.name) private inventoryModel: Model<Inventory>,
  ) {}
  async findProductById(productId: string): Promise<Inventory> {
    const product = await this.inventoryModel.findById(productId);
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }
    return product;
  }

  async create(
    createInventoryInput: CreateInventoryInput,
    user: CurrentUserPayload,
  ): Promise<InventoryOutput> {
    const createdInventory = new this.inventoryModel({
      ...createInventoryInput,
      category: createInventoryInput.categoryId
        ? new Types.ObjectId(createInventoryInput.categoryId)
        : null,
      company: new Types.ObjectId(user.company._id),
      createdBy: new Types.ObjectId(user.id),
    });

    const savedInventory = await createdInventory.save();

    const populatedInventory = (await this.inventoryModel
      .findById(savedInventory._id)
      .populate('category')
      .exec()) as Inventory & { category: Category };

    return this.toInventoryOutput(populatedInventory);
  }

  async findAll(user: CurrentUserPayload): Promise<InventoryOutput[]> {
    let inventories;

    if (user.roles.includes('SUPER_ADMIN')) {
      inventories = await this.inventoryModel
        .find()
        .populate({
          path: 'category',
          select: 'categoryId name description createdAt updatedAt',
        })
        .sort({ createdAt: -1 })
        .exec();
    } else {
      inventories = await this.inventoryModel
        .find({ company: user.company._id })
        .populate({
          path: 'category',
          select: 'categoryId name description createdAt updatedAt',
        })
        .sort({ createdAt: -1 })
        .exec();
    }

    return inventories.map((inventory) =>
      this.toInventoryOutput(inventory as Inventory & { category: Category }),
    );
  }
  async findOne(
    inventoryId: string,
    user: CurrentUserPayload,
  ): Promise<InventoryOutput> {
    let inventory;

    if (user.roles.includes('SUPER_ADMIN')) {
      inventory = await this.inventoryModel
        .findById(inventoryId)
        .populate('category')
        .exec();
    } else {
      inventory = await this.inventoryModel
        .findOne({ _id: inventoryId, company: user.company._id })
        .populate('category')
        .exec();
    }

    if (!inventory) {
      throw new Error('Inventory not found');
    }

    return this.toInventoryOutput(
      inventory as Inventory & { category: Category },
    );
  }
  async update(
    inventoryId: string,
    updateInventoryInput: UpdateInventoryInput,
    user: CurrentUserPayload,
  ): Promise<InventoryOutput> {
    const { categoryId, ...rest } = updateInventoryInput;
    const updateData: Partial<Inventory> = {
      ...rest,
    };

    if (categoryId) {
      updateData.category = new Types.ObjectId(categoryId);
    } else {
      updateData.category = undefined;
    }

    let updatedInventory;

    if (user.roles.includes('SUPER_ADMIN')) {
      throw new Error('SUPER_ADMIN cannot update inventory');
    } else {
      updatedInventory = await this.inventoryModel
        .findOneAndUpdate(
          { _id: inventoryId, company: user.company._id },
          updateData,
          { new: true },
        )
        .populate('category')
        .exec();
    }

    if (!updatedInventory) {
      throw new Error('Inventory not found');
    }

    return this.toInventoryOutput(
      updatedInventory as Inventory & { category: Category },
    );
  }

  async remove(
    inventoryId: string,
    user: CurrentUserPayload,
  ): Promise<InventoryOutput> {
    let removedInventory;

    if (user.roles.includes('SUPER_ADMIN')) {
      throw new Error('SUPER_ADMIN cannot remove inventory');
    } else {
      removedInventory = await this.inventoryModel
        .findOneAndDelete({ _id: inventoryId, company: user.company._id })
        .populate('category')
        .exec();
    }

    if (!removedInventory) {
      throw new Error('Inventory not found');
    }

    return this.toInventoryOutput(
      removedInventory as Inventory & { category: Category },
    );
  }

  async reduceStock(productId: string, quantity: number): Promise<void> {
    const product = await this.inventoryModel.findById(productId);

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    if (product.quantity < quantity) {
      throw new Error(`Not enough stock for product ${product.name}`);
    }

    product.quantity -= quantity;

    await product.save();
  }

  private toInventoryOutput(
    inventory: Inventory & { category: Category },
  ): InventoryOutput {
    return {
      inventoryId: inventory._id.toString(),
      name: inventory.name,
      quantity: inventory.quantity,
      description: inventory.description,
      sku: inventory.sku,
      price: inventory.price,
      purchasePrice: inventory.purchasePrice,
      expirationDate: inventory.expirationDate,
      status: inventory.status,
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
      category: inventory.category
        ? {
            categoryId: inventory.category._id.toString(),
            name: inventory.category.name,
            description: inventory.category.description,
            createdAt: inventory.category.createdAt,
            updatedAt: inventory.category.updatedAt,
          }
        : null,
    };
  }
}
