import { InputType, PartialType } from '@nestjs/graphql';
import { CreateServiceInput } from './create-service.input';

@InputType()
export class UpdateServiceInput extends PartialType(CreateServiceInput) {}
