// pos.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Order, OrderSchema } from './schemas/order.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { ServiceModule } from 'src/services/service.module';
import { PosService } from './pos.service';
import { PosResolver } from './pos.resolver';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    InventoryModule,
    ServiceModule,
  ],
  providers: [PosService, PosResolver],
})
export class PosModule {}
