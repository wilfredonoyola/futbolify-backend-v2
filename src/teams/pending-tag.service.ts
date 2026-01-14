import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PendingTag, PendingTagDocument, PendingTagStatus } from './schemas/pending-tag.schema';
import { Media, MediaDocument } from './schemas/media.schema';
import { MediaTag, MediaTagDocument } from './schemas/media-tag.schema';
import { TeamMatch, TeamMatchDocument } from './schemas/team-match.schema';
import { TeamsService } from './teams.service';
import { CreatePendingTagInput } from './dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PendingTagService {
  constructor(
    @InjectModel(PendingTag.name) private pendingTagModel: Model<PendingTagDocument>,
    @InjectModel(Media.name) private mediaModel: Model<MediaDocument>,
    @InjectModel(MediaTag.name) private mediaTagModel: Model<MediaTagDocument>,
    @InjectModel(TeamMatch.name) private teamMatchModel: Model<TeamMatchDocument>,
    private teamsService: TeamsService,
  ) {}

  /**
   * Generate a unique invite code
   */
  private generateInviteCode(): string {
    // Generate a short unique code (8 characters)
    return uuidv4().substring(0, 8).toUpperCase();
  }

  /**
   * Create a pending tag invitation for a non-registered user
   */
  async createPendingTag(userId: string, input: CreatePendingTagInput): Promise<PendingTag> {
    // Get the media to find the team
    const media = await this.mediaModel.findById(input.mediaId);
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Get the match to find the team
    const match = await this.teamMatchModel.findById(media.matchId);
    if (!match) {
      throw new NotFoundException('Match not found');
    }

    // Verify user is a member of the team
    await this.teamsService.verifyTeamMember(userId, match.teamId.toString());

    // Generate unique invite code
    let inviteCode: string;
    let exists = true;
    while (exists) {
      inviteCode = this.generateInviteCode();
      const found = await this.pendingTagModel.findOne({ inviteCode });
      exists = !!found;
    }

    // Create the pending tag
    const pendingTag = await this.pendingTagModel.create({
      mediaId: new Types.ObjectId(input.mediaId),
      teamId: match.teamId,
      name: input.name,
      phone: input.phone,
      inviteCode,
      status: PendingTagStatus.PENDING,
      createdBy: new Types.ObjectId(userId),
    });

    return pendingTag;
  }

  /**
   * Get pending tags for a specific media
   */
  async getPendingTags(mediaId: string, userId: string): Promise<PendingTag[]> {
    const media = await this.mediaModel.findById(mediaId);
    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, media.matchId.toString());

    return this.pendingTagModel
      .find({ mediaId: new Types.ObjectId(mediaId), status: PendingTagStatus.PENDING })
      .populate('createdBy')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get all pending invitations for a team (admin view)
   */
  async getTeamPendingInvitations(teamId: string, userId: string): Promise<PendingTag[]> {
    // Verify user is a member of the team
    await this.teamsService.verifyTeamMember(userId, teamId);

    return this.pendingTagModel
      .find({ teamId: new Types.ObjectId(teamId), status: PendingTagStatus.PENDING })
      .populate('media')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Get pending tags that can be claimed by a phone number
   * Used after registration to auto-claim tags
   */
  async getMyPendingTags(phone: string): Promise<PendingTag[]> {
    return this.pendingTagModel
      .find({ phone, status: PendingTagStatus.PENDING })
      .populate('media')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Cancel a pending tag invitation
   */
  async cancelPendingTag(pendingTagId: string, userId: string): Promise<boolean> {
    const pendingTag = await this.pendingTagModel.findById(pendingTagId);
    
    if (!pendingTag) {
      throw new NotFoundException('Pending tag not found');
    }

    // Only the creator can cancel
    if (pendingTag.createdBy.toString() !== userId) {
      // Check if user is team admin
      try {
        await this.teamsService.verifyTeamAdmin(userId, pendingTag.teamId.toString());
      } catch {
        throw new ForbiddenException('Only the creator or team admin can cancel this invitation');
      }
    }

    pendingTag.status = PendingTagStatus.CANCELLED;
    await pendingTag.save();

    return true;
  }

  /**
   * Claim pending tags by phone number
   * Called after user registration to automatically tag them in media
   */
  async claimPendingTagsByPhone(userId: string, phone: string): Promise<number> {
    // Find all pending tags for this phone number
    const pendingTags = await this.pendingTagModel.find({
      phone,
      status: PendingTagStatus.PENDING,
    });

    if (pendingTags.length === 0) {
      return 0;
    }

    let claimedCount = 0;

    for (const pendingTag of pendingTags) {
      try {
        // Create the actual media tag
        await this.mediaTagModel.create({
          mediaId: pendingTag.mediaId,
          userId: new Types.ObjectId(userId),
          taggedBy: pendingTag.createdBy,
        });

        // Update pending tag status
        pendingTag.status = PendingTagStatus.CLAIMED;
        pendingTag.claimedBy = new Types.ObjectId(userId);
        pendingTag.claimedAt = new Date();
        await pendingTag.save();

        claimedCount++;
      } catch (error) {
        // If tag already exists (duplicate), just mark as claimed
        if (error.code === 11000) {
          pendingTag.status = PendingTagStatus.CLAIMED;
          pendingTag.claimedBy = new Types.ObjectId(userId);
          pendingTag.claimedAt = new Date();
          await pendingTag.save();
          claimedCount++;
        }
        // Otherwise, skip this tag and continue
        console.error('Error claiming pending tag:', error);
      }
    }

    return claimedCount;
  }

  /**
   * Claim pending tags by invite code
   * Used when user clicks on invitation link
   */
  async claimPendingTagByCode(userId: string, inviteCode: string): Promise<PendingTag> {
    const pendingTag = await this.pendingTagModel.findOne({
      inviteCode: inviteCode.toUpperCase(),
      status: PendingTagStatus.PENDING,
    });

    if (!pendingTag) {
      throw new NotFoundException('Invitation not found or already claimed');
    }

    // Create the actual media tag
    try {
      await this.mediaTagModel.create({
        mediaId: pendingTag.mediaId,
        userId: new Types.ObjectId(userId),
        taggedBy: pendingTag.createdBy,
      });
    } catch (error) {
      // If tag already exists, just continue
      if (error.code !== 11000) {
        throw error;
      }
    }

    // Update pending tag status
    pendingTag.status = PendingTagStatus.CLAIMED;
    pendingTag.claimedBy = new Types.ObjectId(userId);
    pendingTag.claimedAt = new Date();
    await pendingTag.save();

    // Auto-join the team if not already a member
    try {
      const team = await this.teamsService.getTeam(pendingTag.teamId.toString(), userId);
    } catch (error) {
      // User is not a member, try to join
      if (error.status === 403) {
        const teamDoc = await this.teamsService.getTeamByCode(
          (await this.teamsService.getTeam(pendingTag.teamId.toString(), pendingTag.createdBy.toString())).code
        );
        // The user will need to join the team separately
      }
    }

    return pendingTag;
  }

  /**
   * Get pending tag by invite code (public, for preview)
   */
  async getPendingTagByCode(inviteCode: string): Promise<PendingTag | null> {
    return this.pendingTagModel
      .findOne({ inviteCode: inviteCode.toUpperCase() })
      .populate('media')
      .exec();
  }
}
