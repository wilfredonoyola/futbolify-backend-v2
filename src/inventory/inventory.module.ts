import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryService } from './inventory.service';
import { InventoryResolver } from './inventory.resolver';
import { Inventory, InventorySchema } from './schemas/inventory.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Inventory.name, schema: InventorySchema },
    ]),
  ],
  providers: [InventoryService, InventoryResolver],
  exports: [InventoryService], // Exporta InventoryService para que otros módulos puedan usarlo
})
export class InventoryModule {}
