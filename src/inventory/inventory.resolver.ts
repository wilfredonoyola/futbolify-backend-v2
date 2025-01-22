import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryInput,
  InventoryOutput,
  UpdateInventoryInput,
} from './dto';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from 'src/auth/gql-auth.guard';

@Resolver(() => InventoryOutput)
export class InventoryResolver {
  constructor(private readonly inventoryService: InventoryService) {}

  @Mutation(() => InventoryOutput)
  @UseGuards(GqlAuthGuard)
  async createInventory(
    @CurrentUser() user: CurrentUserPayload, // Recibe el usuario logueado
    @Args('createInventoryInput') createInventoryInput: CreateInventoryInput,
  ): Promise<InventoryOutput> {
    return this.inventoryService.create(createInventoryInput, user);
  }

  @Query(() => [InventoryOutput], { name: 'inventories' })
  @UseGuards(GqlAuthGuard)
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<InventoryOutput[]> {
    return this.inventoryService.findAll(user);
  }

  @Query(() => InventoryOutput, { name: 'inventory' })
  @UseGuards(GqlAuthGuard)
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Args('inventoryId') inventoryId: string,
  ) {
    return this.inventoryService.findOne(inventoryId, user);
  }

  @Mutation(() => InventoryOutput)
  @UseGuards(GqlAuthGuard)
  updateInventory(
    @CurrentUser() user: CurrentUserPayload,
    @Args('inventoryId') inventoryId: string,
    @Args('updateInventoryInput') updateInventoryInput: UpdateInventoryInput,
  ) {
    return this.inventoryService.update(
      inventoryId,
      updateInventoryInput,
      user,
    );
  }

  @Mutation(() => InventoryOutput)
  @UseGuards(GqlAuthGuard)
  removeInventory(
    @CurrentUser() user: CurrentUserPayload,
    @Args('inventoryId') inventoryId: string,
  ) {
    return this.inventoryService.remove(inventoryId, user);
  }
}
