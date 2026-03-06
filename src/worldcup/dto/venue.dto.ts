import { Field, ObjectType, Float } from '@nestjs/graphql';
import { LocalizedString } from './team.dto';

@ObjectType()
export class VenueCoordinates {
  @Field(() => Float)
  lat: number;

  @Field(() => Float)
  lng: number;
}

@ObjectType()
export class VenueDto {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field(() => LocalizedString)
  city: LocalizedString;

  @Field()
  state: string;

  @Field()
  country: string;

  @Field()
  capacity: number;

  @Field()
  timezone: string;

  @Field(() => VenueCoordinates)
  coordinates: VenueCoordinates;

  @Field({ nullable: true })
  image?: string;
}

// Simplified version for embedded use
@ObjectType()
export class VenueInfo {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  city: string;

  @Field()
  country: string;
}
