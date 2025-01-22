// dto/item.dto.ts
import { Field, ObjectType, Float, ID, Int } from '@nestjs/graphql';
import { CategoryOutput } from 'src/category/dto/category.output'; // Importa el DTO de la categoría
import { ItemType } from '../enums/item-type.enum';

@ObjectType()
export class Item {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field(() => Float)
  price: number;

  @Field(() => Int)
  quantity: number;

  @Field(() => CategoryOutput, { nullable: true })
  category?: CategoryOutput;

  @Field()
  type: ItemType;
}
