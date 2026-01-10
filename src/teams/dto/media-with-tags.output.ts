import { ObjectType, Field } from '@nestjs/graphql';
import { Media } from '../schemas/media.schema';
import { User } from '../../users/schemas/user.schema';

@ObjectType()
export class MediaWithTags extends Media {
  @Field(() => [User])
  taggedUsers: User[];
}

