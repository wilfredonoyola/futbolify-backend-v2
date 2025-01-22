import { InputType, Field, ID } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

@InputType()
export class CreateCompanyInput {
  @Field(() => ID, {
    nullable: true,
    description: 'Optional ID for the company',
  })
  companyId?: string; // Opcional para permitir asignar un ID específico

  @Field()
  @IsString()
  @IsNotEmpty()
  name: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  address?: string;
}
