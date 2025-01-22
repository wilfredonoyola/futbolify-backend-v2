// src/common/enums/item-type.enum.ts
import { registerEnumType } from '@nestjs/graphql';

// Enum que define si un ítem es un producto o un servicio
export enum ItemType {
  PRODUCT = 'product',
  SERVICE = 'service',
}

// Registrar el enum en GraphQL para que esté disponible en el esquema
registerEnumType(ItemType, {
  name: 'ItemType',
  description: 'Indica si un ítem es un producto o un servicio',
});
