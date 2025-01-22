import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Order,
  OrderItem,
  OrderItemSchema,
  OrderSchema,
} from 'src/pos/schemas/order.schema';
import { CommercialInvoicePosResolver } from './comercialInvoice.resolver';
import { CommercialInvoicePosService } from './comercialInvoice.service';
import {
  Invoice,
  EditedInvoiceSchema,
} from './schemas/comercialInvoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderItem.name, schema: OrderItemSchema },
      { name: Invoice.name, schema: EditedInvoiceSchema },
    ]),
  ],
  providers: [CommercialInvoicePosService, CommercialInvoicePosResolver],
})
export class CommercialInvoicePosModule {}
