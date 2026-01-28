import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { IsString, IsNotEmpty, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { BrandMemberRole } from '../schemas/brand-member.schema';
import { InvitationStatus } from '../schemas/brand-invitation.schema';

// ============== Input Types ==============

@InputType()
export class InviteToBrandInput {
  @Field(() => ID)
  @IsString()
  @IsNotEmpty()
  brandId: string;

  @Field(() => BrandMemberRole)
  @IsEnum(BrandMemberRole)
  role: BrandMemberRole;

  @Field({ nullable: true })
  @IsEmail()
  @IsOptional()
  email?: string;
}

@InputType()
export class JoinBrandInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  code: string;
}

@InputType()
export class UpdateBrandMemberRoleInput {
  @Field(() => ID)
  @IsString()
  @IsNotEmpty()
  brandId: string;

  @Field(() => ID)
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Field(() => BrandMemberRole)
  @IsEnum(BrandMemberRole)
  role: BrandMemberRole;
}

// ============== Output Types ==============

@ObjectType()
export class BrandMemberUser {
  @Field(() => ID)
  userId: string;

  @Field()
  email: string;

  @Field()
  userName: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  avatarUrl?: string;
}

@ObjectType()
export class BrandMemberWithUser {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  brandId: string;

  @Field(() => ID)
  userId: string;

  @Field(() => BrandMemberRole)
  role: BrandMemberRole;

  @Field(() => Date)
  joinedAt: Date;

  @Field(() => BrandMemberUser, { nullable: true })
  user?: BrandMemberUser;
}

@ObjectType()
export class BrandInvitationResult {
  @Field(() => ID)
  id: string;

  @Field()
  code: string;

  @Field({ nullable: true })
  email?: string;

  @Field(() => BrandMemberRole)
  role: BrandMemberRole;

  @Field(() => InvitationStatus)
  status: InvitationStatus;

  @Field(() => Date)
  expiresAt: Date;

  @Field(() => Date)
  createdAt: Date;

  @Field()
  inviteUrl: string;
}

@ObjectType()
export class BrandPublicInfo {
  @Field(() => ID)
  id: string;

  @Field()
  fanPageName: string;

  @Field({ nullable: true })
  logo?: string;

  @Field(() => BrandMemberRole)
  invitedRole: BrandMemberRole;
}

@ObjectType()
export class BrandInvitationInfo {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  brandId: string;

  @Field()
  code: string;

  @Field({ nullable: true })
  email?: string;

  @Field(() => BrandMemberRole)
  role: BrandMemberRole;

  @Field(() => InvitationStatus)
  status: InvitationStatus;

  @Field(() => Date)
  expiresAt: Date;

  @Field(() => Date)
  createdAt: Date;
}
