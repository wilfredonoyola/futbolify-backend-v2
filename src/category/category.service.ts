import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category } from './schemas/category.schema';
import {
  CategoryOutput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './dto';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
  ) {}

  async create(
    createCategoryInput: CreateCategoryInput,
    user: CurrentUserPayload, // Recibe el usuario completo
  ): Promise<CategoryOutput> {
    // Si es SUPER_ADMIN, no puede crear categorías
    if (user.roles.includes('SUPER_ADMIN')) {
      throw new Error('SUPER_ADMIN cannot create categories');
    }

    const createdCategory = new this.categoryModel({
      ...createCategoryInput,
      company: new Types.ObjectId(user.company._id), // Asociar la categoría con la empresa del usuario
      createdBy: new Types.ObjectId(user.id), // Asociar el usuario que creó la categoría
    });

    const savedCategory = await createdCategory.save();
    return this.toCategoryOutput(savedCategory);
  }

  async findAll(user: CurrentUserPayload): Promise<CategoryOutput[]> {
    let categories;

    if (user.roles.includes('SUPER_ADMIN')) {
      // SUPER_ADMIN puede ver todas las categorías
      categories = await this.categoryModel
        .find()
        .sort({ createdAt: -1 })
        .exec();
    } else {
      // ADMIN o USER solo pueden ver las categorías de su empresa
      categories = await this.categoryModel
        .find({ company: user.company._id }) // Filtrar por empresa
        .sort({ createdAt: -1 })
        .exec();
    }

    return categories.map((category) => this.toCategoryOutput(category));
  }

  async findOne(
    categoryId: string,
    user: CurrentUserPayload,
  ): Promise<CategoryOutput> {
    let category;

    if (user.roles.includes('SUPER_ADMIN')) {
      // SUPER_ADMIN puede ver cualquier categoría
      category = await this.categoryModel.findById(categoryId).exec();
    } else {
      // ADMIN o USER solo pueden ver categorías de su empresa
      category = await this.categoryModel
        .findOne({ _id: categoryId, company: user.company._id })
        .exec();
    }

    if (!category) {
      throw new Error('Category not found');
    }

    return this.toCategoryOutput(category);
  }

  async update(
    categoryId: string,
    updateCategoryInput: UpdateCategoryInput,
    user: CurrentUserPayload,
  ): Promise<CategoryOutput> {
    let updatedCategory;

    if (user.roles.includes('SUPER_ADMIN')) {
      throw new Error('SUPER_ADMIN cannot update categories');
    } else {
      updatedCategory = await this.categoryModel
        .findOneAndUpdate(
          { _id: categoryId, company: user.company._id }, // Filtrar por empresa y categoría
          updateCategoryInput,
          { new: true },
        )
        .exec();
    }

    if (!updatedCategory) {
      throw new Error('Category not found');
    }

    return this.toCategoryOutput(updatedCategory);
  }

  async remove(
    categoryId: string,
    user: CurrentUserPayload,
  ): Promise<CategoryOutput> {
    let removedCategory;

    if (user.roles.includes('SUPER_ADMIN')) {
      throw new Error('SUPER_ADMIN cannot remove categories');
    } else {
      removedCategory = await this.categoryModel
        .findOneAndDelete({ _id: categoryId, company: user.company._id }) // Eliminar solo si pertenece a la empresa
        .exec();
    }

    if (!removedCategory) {
      throw new Error('Category not found');
    }

    return this.toCategoryOutput(removedCategory);
  }

  private toCategoryOutput(category: Category): CategoryOutput {
    return {
      categoryId: category._id.toString(),
      name: category.name,
      description: category.description,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }
}
