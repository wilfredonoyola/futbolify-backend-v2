import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class InjuryDto {
  @Field()
  player: string;

  @Field()
  type: string; // "Injury", "Suspension", etc

  @Field({ nullable: true })
  reason?: string;
}
