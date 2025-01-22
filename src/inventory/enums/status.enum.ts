import { registerEnumType } from '@nestjs/graphql';

export enum InventoryStatus {
  ACTIVE = 'Active',
  OUT_OF_STOCK = 'Out of Stock',
}

registerEnumType(InventoryStatus, {
  name: 'InventoryStatus',
});
