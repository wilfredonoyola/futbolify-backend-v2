import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';

import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { CommercialInvoicePosService } from './comercialInvoice.service';
import { OrderOutput } from 'src/pos/dto/order.ouput';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from 'src/auth/gql-auth.guard';
import { InvoiceOutput } from './dto/comercialinvoice.ouput';
import { ExcludeProductInput } from './dto/exclude.input';

@Resolver(() => OrderOutput)
export class CommercialInvoicePosResolver {
  constructor(
    private readonly commercialInvoicePosService: CommercialInvoicePosService,
  ) {}
  @Query(() => [OrderOutput], { name: 'todayInvoices' })
  @UseGuards(GqlAuthGuard)
  async findTodayInvoices(
    @Args('date') date: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
      throw new Error('Formato de fecha inválido. Use "dd-mm-yyyy".');
    }

    const [day, month, year] = date.split('-');
    const formattedDate = new Date(`${year}-${month}-${day}T00:00:00`);

    if (isNaN(formattedDate.getTime())) {
      throw new Error('Fecha no válida.');
    }

    return await this.commercialInvoicePosService.findTodayInvoices(
      user,
      formattedDate,
    );
  }

  @Query(() => [OrderOutput], { name: 'getLastMonthInvoices' })
  @UseGuards(GqlAuthGuard)
  async getLastMonthOrders(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OrderOutput[]> {
    return this.commercialInvoicePosService.findPreviousMonthInvoices(user);
  }
  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async excludeInvoices(
    @Args('excludeInvoiceIds', { type: () => [String], nullable: true })
    excludeInvoiceIds: string[] | null,
    @Args('excludeProducts', {
      type: () => [ExcludeProductInput],
      nullable: true,
    })
    excludeProducts: ExcludeProductInput[] | null,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<boolean> {
    const cleanedExcludeInvoiceIds = Array.isArray(excludeInvoiceIds)
      ? excludeInvoiceIds.filter((id) => id.trim() !== '')
      : excludeInvoiceIds === ''
      ? []
      : [];

    const cleanedExcludeProducts =
      excludeProducts
        ?.map(({ invoiceId, productorserviceId }) => ({
          invoiceId: invoiceId.trim(),
          productorserviceId: productorserviceId.trim(),
        }))
        .filter(
          ({ invoiceId, productorserviceId }) =>
            invoiceId && productorserviceId,
        ) || [];

    return await this.commercialInvoicePosService.excludeInvoices(
      user,
      cleanedExcludeInvoiceIds,
      cleanedExcludeProducts,
    );
  }

  @Query(() => [InvoiceOutput], { name: 'getInvoices' })
  @UseGuards(GqlAuthGuard)
  async getInvoices(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<InvoiceOutput[]> {
    return this.commercialInvoicePosService.findAllInvoices(user);
  }
}
