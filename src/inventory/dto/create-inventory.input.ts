import { InputType, Field, Int, Float, ID } from '@nestjs/graphql';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { InventoryStatus } from '../enums/status.enum';

@InputType()
export class CreateInventoryInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  name: string;

  @Field(() => Int)
  @IsInt()
  @IsNotEmpty()
  quantity: number;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  description?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  sku?: string;

  @Field({ nullable: true })
  @IsNotEmpty()
  price: number;

  @Field({ nullable: true })
  @IsOptional()
  purchasePrice?: number;

  @Field(() => InventoryStatus, { nullable: true })
  status?: InventoryStatus;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  expirationDate?: number;

  @Field(() => String, { nullable: true })
  categoryId?: string;
}
