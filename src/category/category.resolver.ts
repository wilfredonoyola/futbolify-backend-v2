import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { CategoryService } from './category.service';
import { Category } from './schemas/category.schema';
import {
  CategoryOutput,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './dto';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { GqlAuthGuard } from 'src/auth/gql-auth.guard';
import { UseGuards } from '@nestjs/common';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';

@Resolver(() => Category)
export class CategoryResolver {
  constructor(private readonly categoryService: CategoryService) {}

  @Mutation(() => CategoryOutput)
  @UseGuards(GqlAuthGuard)
  createCategory(
    @Args('createCategoryInput') createCategoryInput: CreateCategoryInput,
    @CurrentUser() user: CurrentUserPayload, // Tipado correcto del usuario
  ) {
    return this.categoryService.create(createCategoryInput, user);
  }

  @Query(() => [CategoryOutput], { name: 'categories' })
  @UseGuards(GqlAuthGuard)
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.categoryService.findAll(user);
  }

  @Query(() => CategoryOutput, { name: 'category' })
  @UseGuards(GqlAuthGuard)
  findOne(
    @Args('categoryId') categoryId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.categoryService.findOne(categoryId, user);
  }

  @Mutation(() => CategoryOutput)
  @UseGuards(GqlAuthGuard)
  updateCategory(
    @Args('categoryId') categoryId: string,
    @Args('updateCategoryInput') updateCategoryInput: UpdateCategoryInput,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.categoryService.update(categoryId, updateCategoryInput, user);
  }

  @Mutation(() => CategoryOutput)
  @UseGuards(GqlAuthGuard)
  removeCategory(
    @Args('categoryId') categoryId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.categoryService.remove(categoryId, user);
  }
}
