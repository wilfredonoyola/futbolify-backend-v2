import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Brand } from './schemas/brand.schema';
import { BrandMember, BrandMemberDocument, BrandMemberRole } from './schemas/brand-member.schema';
import {
  BrandInvitation,
  BrandInvitationDocument,
  InvitationStatus,
} from './schemas/brand-invitation.schema';
import {
  InviteToBrandInput,
  JoinBrandInput,
  UpdateBrandMemberRoleInput,
  BrandMemberWithUser,
  BrandInvitationResult,
  BrandPublicInfo,
  BrandInvitationInfo,
} from './dto/brand-member.dto';

@Injectable()
export class BrandMemberService {
  constructor(
    @InjectModel(Brand.name) private brandModel: Model<Brand>,
    @InjectModel(BrandMember.name) private brandMemberModel: Model<BrandMemberDocument>,
    @InjectModel(BrandInvitation.name) private brandInvitationModel: Model<BrandInvitationDocument>,
    private configService: ConfigService,
  ) {}

  // ============== INVITATIONS ==============

  /**
   * Create an invitation to join a brand
   */
  async createInvitation(
    userId: string,
    input: InviteToBrandInput,
  ): Promise<BrandInvitationResult> {
    // Verify user is owner of the brand
    await this.verifyBrandOwner(userId, input.brandId);

    // Cannot invite as OWNER
    if (input.role === BrandMemberRole.OWNER) {
      throw new BadRequestException('Cannot invite someone as OWNER');
    }

    // Generate unique 8-character code
    let code: string;
    let exists = true;

    while (exists) {
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const found = await this.brandInvitationModel.findOne({ code });
      exists = !!found;
    }

    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await this.brandInvitationModel.create({
      brandId: new Types.ObjectId(input.brandId),
      code,
      email: input.email,
      role: input.role,
      status: InvitationStatus.PENDING,
      createdBy: new Types.ObjectId(userId),
      expiresAt,
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const inviteUrl = `${frontendUrl}/join?code=${code}`;

    return {
      id: invitation._id.toString(),
      code: invitation.code,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      inviteUrl,
    };
  }

  /**
   * Get all pending invitations for a brand
   */
  async getBrandInvitations(userId: string, brandId: string): Promise<BrandInvitationInfo[]> {
    // Verify user is member of the brand
    await this.verifyBrandMember(userId, brandId);

    const invitations = await this.brandInvitationModel
      .find({
        brandId: new Types.ObjectId(brandId),
        status: InvitationStatus.PENDING,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .exec();

    return invitations.map((inv) => ({
      id: inv._id.toString(),
      brandId: inv.brandId.toString(),
      code: inv.code,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }

  /**
   * Revoke an invitation
   */
  async revokeInvitation(userId: string, invitationId: string): Promise<boolean> {
    const invitation = await this.brandInvitationModel.findById(invitationId);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    // Verify user is owner of the brand
    await this.verifyBrandOwner(userId, invitation.brandId.toString());

    invitation.status = InvitationStatus.REVOKED;
    await invitation.save();

    return true;
  }

  /**
   * Get brand info by invite code (public)
   */
  async getBrandByInviteCode(code: string): Promise<BrandPublicInfo> {
    const invitation = await this.brandInvitationModel.findOne({
      code: code.toUpperCase(),
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid or expired invitation code');
    }

    const brand = await this.brandModel.findById(invitation.brandId);

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    return {
      id: brand._id.toString(),
      fanPageName: brand.fanPageName,
      logo: brand.tokens?.logo,
      invitedRole: invitation.role,
    };
  }

  // ============== JOINING ==============

  /**
   * Join a brand using an invitation code
   */
  async joinBrand(userId: string, input: JoinBrandInput): Promise<Brand> {
    const invitation = await this.brandInvitationModel.findOne({
      code: input.code.toUpperCase(),
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid or expired invitation code');
    }

    const brand = await this.brandModel.findById(invitation.brandId);

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    // Check if already a member
    const existingMember = await this.brandMemberModel.findOne({
      brandId: invitation.brandId,
      userId: new Types.ObjectId(userId),
    });

    if (existingMember) {
      throw new BadRequestException('You are already a member of this brand');
    }

    // Check if invitation is for a specific email
    // Note: We don't enforce email matching here to allow flexibility
    // The frontend can validate email if needed

    // Add as member
    await this.brandMemberModel.create({
      brandId: invitation.brandId,
      userId: new Types.ObjectId(userId),
      role: invitation.role,
    });

    // Mark invitation as accepted
    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedBy = new Types.ObjectId(userId);
    await invitation.save();

    return brand;
  }

  // ============== MEMBERS ==============

  /**
   * Get all members of a brand with user details
   */
  async getBrandMembers(userId: string, brandId: string): Promise<BrandMemberWithUser[]> {
    // Verify user is member of the brand
    await this.verifyBrandMember(userId, brandId);

    // Get brand owner
    const brand = await this.brandModel.findById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    // Get all explicit members
    const members = await this.brandMemberModel.aggregate([
      { $match: { brandId: new Types.ObjectId(brandId) } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userArray',
        },
      },
      {
        $addFields: {
          user: { $arrayElemAt: ['$userArray', 0] },
        },
      },
      {
        $project: {
          userArray: 0,
        },
      },
    ]);

    // Check if owner is in members list
    const ownerInMembers = members.some(
      (m) => m.userId.toString() === brand.userId.toString(),
    );

    // If owner not in members, fetch and add them
    let allMembers = members;
    if (!ownerInMembers) {
      const ownerData = await this.brandMemberModel.aggregate([
        {
          $match: { _id: { $exists: false } }, // Empty match to use aggregation
        },
        {
          $unionWith: {
            coll: 'users',
            pipeline: [
              { $match: { _id: brand.userId } },
              {
                $project: {
                  _id: new Types.ObjectId(),
                  brandId: new Types.ObjectId(brandId),
                  userId: '$_id',
                  role: BrandMemberRole.OWNER,
                  joinedAt: brand.createdAt,
                  user: '$$ROOT',
                },
              },
            ],
          },
        },
      ]);

      // Get owner user data directly
      const ownerUser = await this.brandModel.db
        .collection('users')
        .findOne({ _id: brand.userId });

      if (ownerUser) {
        const ownerMember = {
          _id: new Types.ObjectId(),
          brandId: new Types.ObjectId(brandId),
          userId: brand.userId,
          role: BrandMemberRole.OWNER,
          joinedAt: brand.createdAt,
          user: ownerUser,
        };
        allMembers = [ownerMember, ...members];
      }
    }

    // Transform to match GraphQL schema
    return allMembers.map((member) => {
      const hasValidUser = member.user && member.user._id && member.user.email;

      return {
        id: member._id.toString(),
        brandId: member.brandId.toString(),
        userId: member.userId.toString(),
        role: member.role,
        joinedAt: member.joinedAt,
        user: hasValidUser
          ? {
              userId: member.user._id.toString(),
              email: member.user.email,
              userName: member.user.userName || member.user.email,
              name: member.user.name || null,
              avatarUrl: member.user.avatarUrl || null,
            }
          : null,
      };
    });
  }

  /**
   * Get user's role in a brand
   */
  async getMyBrandRole(userId: string, brandId: string): Promise<BrandMemberRole | null> {
    // Check if user is the brand owner
    const brand = await this.brandModel.findById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    if (brand.userId.toString() === userId) {
      return BrandMemberRole.OWNER;
    }

    // Check membership
    const member = await this.brandMemberModel.findOne({
      brandId: new Types.ObjectId(brandId),
      userId: new Types.ObjectId(userId),
    });

    return member?.role || null;
  }

  /**
   * Update a member's role
   */
  async updateMemberRole(
    userId: string,
    input: UpdateBrandMemberRoleInput,
  ): Promise<BrandMemberWithUser> {
    // Verify user is owner
    await this.verifyBrandOwner(userId, input.brandId);

    // Cannot change to OWNER
    if (input.role === BrandMemberRole.OWNER) {
      throw new BadRequestException('Cannot change role to OWNER');
    }

    const member = await this.brandMemberModel.findOne({
      brandId: new Types.ObjectId(input.brandId),
      userId: new Types.ObjectId(input.userId),
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Cannot change owner's role
    if (member.role === BrandMemberRole.OWNER) {
      throw new BadRequestException('Cannot change owner role');
    }

    member.role = input.role;
    await member.save();

    // Fetch user data
    const userDoc = await this.brandModel.db
      .collection('users')
      .findOne({ _id: new Types.ObjectId(input.userId) });

    return {
      id: member._id.toString(),
      brandId: member.brandId.toString(),
      userId: member.userId.toString(),
      role: member.role,
      joinedAt: member.joinedAt,
      user: userDoc
        ? {
            userId: userDoc._id.toString(),
            email: userDoc.email,
            userName: userDoc.userName || userDoc.email,
            name: userDoc.name || null,
            avatarUrl: userDoc.avatarUrl || null,
          }
        : null,
    };
  }

  /**
   * Remove a member from a brand
   */
  async removeMember(userId: string, brandId: string, memberUserId: string): Promise<boolean> {
    // Verify user is owner
    await this.verifyBrandOwner(userId, brandId);

    // Cannot remove yourself (use leaveBrand instead)
    if (userId === memberUserId) {
      throw new BadRequestException('Use leaveBrand to remove yourself');
    }

    // Cannot remove the brand owner
    const brand = await this.brandModel.findById(brandId);
    if (brand && brand.userId.toString() === memberUserId) {
      throw new BadRequestException('Cannot remove the brand owner');
    }

    const member = await this.brandMemberModel.findOne({
      brandId: new Types.ObjectId(brandId),
      userId: new Types.ObjectId(memberUserId),
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await this.brandMemberModel.findByIdAndDelete(member._id);
    return true;
  }

  /**
   * Leave a brand (for non-owners)
   */
  async leaveBrand(userId: string, brandId: string): Promise<boolean> {
    // Check if user is the brand owner
    const brand = await this.brandModel.findById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    if (brand.userId.toString() === userId) {
      throw new BadRequestException('Owner cannot leave the brand. Transfer ownership or delete the brand.');
    }

    const member = await this.brandMemberModel.findOne({
      brandId: new Types.ObjectId(brandId),
      userId: new Types.ObjectId(userId),
    });

    if (!member) {
      throw new NotFoundException('You are not a member of this brand');
    }

    await this.brandMemberModel.findByIdAndDelete(member._id);
    return true;
  }

  // ============== HELPERS ==============

  /**
   * Verify user is a member of the brand (owner or member)
   */
  async verifyBrandMember(userId: string, brandId: string): Promise<BrandMemberRole> {
    // Check if user is the brand owner
    const brand = await this.brandModel.findById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    if (brand.userId.toString() === userId) {
      return BrandMemberRole.OWNER;
    }

    // Check membership
    const member = await this.brandMemberModel.findOne({
      brandId: new Types.ObjectId(brandId),
      userId: new Types.ObjectId(userId),
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this brand');
    }

    return member.role;
  }

  /**
   * Verify user is the owner of the brand
   */
  async verifyBrandOwner(userId: string, brandId: string): Promise<void> {
    const brand = await this.brandModel.findById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    if (brand.userId.toString() !== userId) {
      throw new ForbiddenException('Only the brand owner can perform this action');
    }
  }

  /**
   * Verify user can edit the brand (owner or editor)
   */
  async verifyCanEdit(userId: string, brandId: string): Promise<BrandMemberRole> {
    const role = await this.verifyBrandMember(userId, brandId);

    if (role === BrandMemberRole.VIEWER) {
      throw new ForbiddenException('You do not have permission to edit this brand');
    }

    return role;
  }

  /**
   * Check if user has access to a brand (for queries)
   */
  async hasAccess(userId: string, brandId: string): Promise<boolean> {
    try {
      await this.verifyBrandMember(userId, brandId);
      return true;
    } catch {
      return false;
    }
  }
}
