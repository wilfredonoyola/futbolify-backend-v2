import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class ExcludeProductInput {
  @Field()
  invoiceId: string;

  @Field()
  productorserviceId: string;
}
