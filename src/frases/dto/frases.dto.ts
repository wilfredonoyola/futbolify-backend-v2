import { InputType, Field, Int, ObjectType } from '@nestjs/graphql';
import { FraseCategory, FraseTone } from '../schemas/frase.schema';

@InputType()
export class GenerateFraseInput {
  @Field(() => FraseCategory)
  categoria: FraseCategory;

  @Field(() => FraseTone, { nullable: true })
  tono?: FraseTone;

  @Field({ nullable: true })
  equipo?: string;

  @Field(() => Int, { defaultValue: 3 })
  count?: number;
}

@ObjectType()
export class GeneratedFrase {
  @Field()
  texto: string;

  @Field({ nullable: true })
  autor?: string;

  @Field({ nullable: true })
  emoji?: string;

  @Field({ nullable: true })
  tag?: string;
}

@ObjectType()
export class GenerateResponse {
  @Field(() => [GeneratedFrase])
  frases: GeneratedFrase[];
}

@InputType()
export class SaveFraseInput {
  @Field()
  texto: string;

  @Field({ nullable: true })
  autor?: string;

  @Field(() => FraseCategory)
  categoria: FraseCategory;

  @Field(() => FraseTone, { nullable: true })
  tono?: FraseTone;

  @Field({ nullable: true })
  equipo?: string;

  @Field({ nullable: true })
  emoji?: string;

  @Field({ nullable: true })
  tag?: string;

  @Field({ nullable: true })
  exportedImageUrl?: string;
}

@InputType()
export class FilterFrasesInput {
  @Field(() => FraseCategory, { nullable: true })
  categoria?: FraseCategory;

  @Field(() => FraseTone, { nullable: true })
  tono?: FraseTone;

  @Field({ nullable: true })
  search?: string;

  @Field({ nullable: true })
  equipo?: string;

  @Field({ defaultValue: false })
  onlyPublic?: boolean;

  @Field(() => Int, { defaultValue: 20 })
  limit?: number;

  @Field(() => Int, { defaultValue: 0 })
  offset?: number;
}
