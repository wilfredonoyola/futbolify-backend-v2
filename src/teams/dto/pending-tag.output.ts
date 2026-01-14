import { ObjectType, Field, ID } from '@nestjs/graphql';
import { User } from '../../users/schemas/user.schema';
import { Media } from '../schemas/media.schema';
import { PendingTagStatus } from '../schemas/pending-tag.schema';

@ObjectType()
export class PendingTagOutput {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  mediaId: string;

  @Field(() => ID)
  teamId: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  phone?: string;

  @Field()
  inviteCode: string;

  @Field()
  inviteUrl: string;

  @Field(() => PendingTagStatus)
  status: PendingTagStatus;

  @Field(() => ID)
  createdBy: string;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Media, { nullable: true })
  media?: Media;

  @Field(() => User, { nullable: true })
  createdByUser?: User;
}
