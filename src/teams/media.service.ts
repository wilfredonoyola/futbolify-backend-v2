import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Media, MediaDocument, MediaType } from './schemas/media.schema';
import { MediaTag, MediaTagDocument } from './schemas/media-tag.schema';
import { TeamMatch, TeamMatchDocument } from './schemas/team-match.schema';
import { TeamsService } from './teams.service';
import { StatsUtils } from './utils/stats.utils';
import { UploadMediaInput, UpdateMediaInput, MediaFiltersInput } from './dto';

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(Media.name) private mediaModel: Model<MediaDocument>,
    @InjectModel(MediaTag.name) private mediaTagModel: Model<MediaTagDocument>,
    @InjectModel(TeamMatch.name) private teamMatchModel: Model<TeamMatchDocument>,
    private teamsService: TeamsService,
  ) {}

  // ============== MEDIA ==============

  async uploadMedia(userId: string, input: UploadMediaInput): Promise<Media> {
    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, input.matchId);

    const media = await this.mediaModel.create({
      ...input,
      matchId: new Types.ObjectId(input.matchId),
      uploadedBy: new Types.ObjectId(userId),
    });

    return media;
  }

  async batchUploadMedia(userId: string, inputs: UploadMediaInput[]): Promise<Media[]> {
    // Verify all matches belong to teams where user is a member
    const matchIds = [...new Set(inputs.map((i) => i.matchId))];
    await Promise.all(matchIds.map((matchId) => this.teamsService.verifyMatchTeamMember(userId, matchId)));

    const mediaItems = await this.mediaModel.insertMany(
      inputs.map((input) => ({
        ...input,
        matchId: new Types.ObjectId(input.matchId),
        uploadedBy: new Types.ObjectId(userId),
      })),
    );

    return mediaItems as Media[];
  }

  async getMatchMedia(matchId: string, userId: string, filters?: MediaFiltersInput): Promise<Media[]> {
    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, matchId);

    const query: any = { matchId: new Types.ObjectId(matchId) };

    if (filters) {
      if (filters.type) query.type = filters.type;
      if (filters.category) query.category = filters.category;
      if (filters.isHighlight !== undefined) query.isHighlight = filters.isHighlight;
    }

    return this.mediaModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async getMedia(mediaId: string, userId: string): Promise<Media> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, media.matchId.toString());

    return media;
  }

  async updateMedia(mediaId: string, userId: string, input: UpdateMediaInput): Promise<Media> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is the uploader or admin of the team
    const isUploader = media.uploadedBy.toString() === userId;
    const match = await this.teamMatchModel.findById(media.matchId);

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!isUploader) {
      // Check if admin
      try {
        await this.teamsService.verifyTeamAdmin(userId, match.teamId.toString());
      } catch {
        throw new ForbiddenException('Only the uploader or team admin can update this media');
      }
    }

    Object.assign(media, input);
    await media.save();

    return media;
  }

  async deleteMedia(mediaId: string, userId: string): Promise<boolean> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is the uploader or admin of the team
    const isUploader = media.uploadedBy.toString() === userId;
    const match = await this.teamMatchModel.findById(media.matchId);

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (!isUploader) {
      // Check if admin
      try {
        await this.teamsService.verifyTeamAdmin(userId, match.teamId.toString());
      } catch {
        throw new ForbiddenException('Only the uploader or team admin can delete this media');
      }
    }

    // Delete all tags for this media
    await this.mediaTagModel.deleteMany({ mediaId: new Types.ObjectId(mediaId) });

    // Delete media
    await this.mediaModel.findByIdAndDelete(mediaId);

    return true;
  }

  async toggleHighlight(mediaId: string, userId: string): Promise<Media> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, media.matchId.toString());

    media.isHighlight = !media.isHighlight;
    await media.save();

    return media;
  }

  // ============== TAGS ==============

  async tagUsersInMedia(mediaId: string, userId: string, userIds: string[]): Promise<boolean> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, media.matchId.toString());

    // Create tags (duplicates will be ignored due to unique index)
    const tagPromises = userIds.map(async (tagUserId) => {
      try {
        await this.mediaTagModel.create({
          mediaId: new Types.ObjectId(mediaId),
          userId: new Types.ObjectId(tagUserId),
          taggedBy: new Types.ObjectId(userId),
        });
      } catch (error) {
        // Ignore duplicate key errors
        if (error.code !== 11000) {
          throw error;
        }
      }
    });

    await Promise.all(tagPromises);

    return true;
  }

  async selfTagMedia(mediaId: string, userId: string): Promise<boolean> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, media.matchId.toString());

    try {
      await this.mediaTagModel.create({
        mediaId: new Types.ObjectId(mediaId),
        userId: new Types.ObjectId(userId),
        taggedBy: new Types.ObjectId(userId),
      });
    } catch (error) {
      // Ignore if already tagged
      if (error.code !== 11000) {
        throw error;
      }
    }

    return true;
  }

  async removeMediaTag(mediaId: string, userId: string, tagUserId: string): Promise<boolean> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, media.matchId.toString());

    const tag = await this.mediaTagModel.findOne({
      mediaId: new Types.ObjectId(mediaId),
      userId: new Types.ObjectId(tagUserId),
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    // Only the person who tagged or the tagged person can remove the tag
    const canRemove = tag.taggedBy.toString() === userId || tag.userId.toString() === userId;

    if (!canRemove) {
      throw new ForbiddenException('You can only remove tags you created or tags of yourself');
    }

    await this.mediaTagModel.findByIdAndDelete(tag._id);

    return true;
  }

  async getMyTaggedMedia(userId: string, type?: MediaType): Promise<Media[]> {
    // Find all tags for this user
    const tags = await this.mediaTagModel.find({ userId: new Types.ObjectId(userId) });
    const mediaIds = tags.map((t) => t.mediaId);

    if (mediaIds.length === 0) {
      return [];
    }

    const query: any = { _id: { $in: mediaIds } };
    if (type) {
      query.type = type;
    }

    return this.mediaModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async getProfileStats(userId: string) {
    return StatsUtils.getProfileStats(userId, this.mediaTagModel, this.mediaModel);
  }
}

