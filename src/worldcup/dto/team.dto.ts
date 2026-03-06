import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum Confederation {
  UEFA = 'UEFA',
  CONMEBOL = 'CONMEBOL',
  CONCACAF = 'CONCACAF',
  CAF = 'CAF',
  AFC = 'AFC',
  OFC = 'OFC',
}

registerEnumType(Confederation, {
  name: 'Confederation',
  description: 'Football confederation',
});

@ObjectType()
export class LocalizedString {
  @Field()
  es: string;

  @Field()
  en: string;
}

@ObjectType()
export class TeamDto {
  @Field()
  id: string;

  @Field()
  code: string;

  @Field(() => LocalizedString)
  name: LocalizedString;

  @Field()
  flag: string;

  @Field()
  groupId: string;

  @Field(() => Confederation)
  confederation: Confederation;

  @Field()
  qualified: boolean;

  @Field()
  isHost: boolean;

  @Field({ nullable: true })
  worldCupAppearances?: number;

  @Field(() => LocalizedString, { nullable: true })
  bestResult?: LocalizedString;

  @Field(() => LocalizedString)
  slug: LocalizedString;
}

// Simplified version for embedded use
@ObjectType()
export class TeamInfo {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  code: string;

  @Field()
  flag: string;
}
