import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { Order } from './schemas/order.schema';
import { Item } from './dto/item.dto';
import { ProcessOrderInput } from './dto/process-order.input';
import { ServiceService } from 'src/services/service.service';
import { InventoryService } from 'src/inventory/inventory.service';
import { PosService } from './pos.service';
import { InventoryOutput } from 'src/inventory/dto';
import { ServiceOutput } from 'src/services/dto';

import { ItemType } from './enums/item-type.enum';
import { OrderOutput } from './dto/order.ouput';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from 'src/auth/gql-auth.guard';
import { TimeRange } from './enums/time-range.enum';
import {
  CustomDateRangeOutput,
  OrdersGroupedByPeriodsOutput,
} from './dto/order-period.ouput';

@Resolver(() => Order)
export class PosResolver {
  constructor(
    private readonly posService: PosService,
    private readonly inventoryService: InventoryService,
    private readonly serviceService: ServiceService,
  ) {}

  @Query(() => [Item], { name: 'getAllItems' })
  @UseGuards(GqlAuthGuard)
  async getAllItems(@CurrentUser() user: CurrentUserPayload): Promise<Item[]> {
    const products = await this.inventoryService.findAll(user);
    const services = await this.serviceService.findAll(user);

    const productItems = products
      .filter((product: InventoryOutput) => product.quantity > 0)
      .map((product: InventoryOutput) => ({
        id: product.inventoryId,
        name: product.name,
        price: product.price,
        quantity: product.quantity,
        category: product.category,
        type: ItemType.PRODUCT,
      }));

    const serviceItems = services.map((service: ServiceOutput) => ({
      id: service.serviceId,
      name: service.name,
      price: service.price,
      quantity: 1,
      category: service.category,
      type: ItemType.SERVICE,
    }));

    return [...productItems, ...serviceItems];
  }

  @Query(() => OrderOutput, { name: 'getOrderById' })
  async getOrderById(
    @Args('orderId', { type: () => String }) orderId: string,
  ): Promise<OrderOutput> {
    return this.posService.findOneOrder(orderId);
  }

  @Query(() => [OrderOutput], { name: 'getOrders' })
  @UseGuards(GqlAuthGuard)
  async getOrders(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OrderOutput[]> {
    return this.posService.findAllOrders(user);
  }

  @Mutation(() => Boolean, { name: 'processOrder' })
  @UseGuards(GqlAuthGuard)
  async processOrder(
    @Args('input') input: ProcessOrderInput,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    return this.posService.createOrder(input, user);
  }

  @Query(() => [OrderOutput], { name: 'getOrdersByDateRange' })
  @UseGuards(GqlAuthGuard)
  async getOrdersByDateRange(
    @Args('startDate', { type: () => String }) startDate: string,
    @Args('endDate', { type: () => String }) endDate: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OrderOutput[]> {
    const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new Error('Formato de fecha inválido. Use "dd-mm-yyyy".');
    }

    const [startDay, startMonth, startYear] = startDate.split('-');
    const start = new Date(
      `${startYear}-${startMonth}-${startDay}T00:00:00.000Z`,
    );

    const [endDay, endMonth, endYear] = endDate.split('-');
    const end = new Date(`${endYear}-${endMonth}-${endDay}T23:59:59.999Z`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Fecha no válida.');
    }

    return this.posService.findOrdersByDateRange(start, end, user);
  }

  @Query(() => CustomDateRangeOutput, { name: 'getOrdersByCustomDateRange' })
  @UseGuards(GqlAuthGuard)
  async getOrdersByCustomDateRange(
    @Args('startDate', { type: () => String }) startDate: string,
    @Args('endDate', { type: () => String }) endDate: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CustomDateRangeOutput> {
    const dateRegex = /^\d{2}-\d{2}-\d{4}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new Error('Formato de fecha inválido. Use "dd-mm-yyyy".');
    }

    const [startDay, startMonth, startYear] = startDate.split('-');
    const start = new Date(
      `${startYear}-${startMonth}-${startDay}T00:00:00.000Z`,
    );

    const [endDay, endMonth, endYear] = endDate.split('-');
    const end = new Date(`${endYear}-${endMonth}-${endDay}T23:59:59.999Z`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Fecha no válida.');
    }

    return this.posService.findOrdersByCustomDateRange(start, end, user);
  }

  @Query(() => OrdersGroupedByPeriodsOutput)
  @UseGuards(GqlAuthGuard)
  async getOrdersByPeriods(
    @CurrentUser() user: CurrentUserPayload,
    @Args('year', { nullable: true }) year?: number,
    @Args('month', { nullable: true }) month?: number,
    @Args('week', { nullable: true }) week?: number,
  ): Promise<OrdersGroupedByPeriodsOutput> {
    return this.posService.getOrdersGroupedByPeriods(user, year, month, week);
  }
}
