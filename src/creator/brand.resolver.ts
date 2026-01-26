import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Brand } from './schemas/brand.schema';
import { BrandService } from './brand.service';
import { CreateBrandInput } from './dto/create-brand.input';
import { UpdateBrandInput } from './dto/update-brand.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => Brand)
@UseGuards(GqlAuthGuard)
export class BrandResolver {
  constructor(private readonly brandService: BrandService) {}

  @Mutation(() => Brand)
  async createBrand(
    @CurrentUser() user: any,
    @Args('input') createBrandInput: CreateBrandInput,
  ): Promise<Brand> {
    return this.brandService.create(user.userId, createBrandInput);
  }

  @Query(() => [Brand])
  async myBrands(@CurrentUser() user: any): Promise<Brand[]> {
    return this.brandService.findAllByUser(user.userId);
  }

  @Query(() => Brand, { nullable: true })
  async activeBrand(@CurrentUser() user: any): Promise<Brand | null> {
    return this.brandService.findActiveBrand(user.userId);
  }

  @Query(() => Brand)
  async brand(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Brand> {
    return this.brandService.findOne(id, user.userId);
  }

  @Query(() => Boolean)
  async hasBrands(@CurrentUser() user: any): Promise<boolean> {
    return this.brandService.hasBrands(user.userId);
  }

  @Mutation(() => Brand)
  async updateBrand(
    @CurrentUser() user: any,
    @Args('input') updateBrandInput: UpdateBrandInput,
  ): Promise<Brand> {
    return this.brandService.update(user.userId, updateBrandInput);
  }

  @Mutation(() => Brand)
  async setActiveBrand(
    @CurrentUser() user: any,
    @Args('brandId', { type: () => ID }) brandId: string,
  ): Promise<Brand> {
    return this.brandService.setActive(user.userId, brandId);
  }

  @Mutation(() => Boolean)
  async deleteBrand(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.brandService.remove(id, user.userId);
  }
}
