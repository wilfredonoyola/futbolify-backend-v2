import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Media, MediaDocument, MediaType } from './schemas/media.schema';
import { MediaTag, MediaTagDocument } from './schemas/media-tag.schema';
import { TeamMatch, TeamMatchDocument } from './schemas/team-match.schema';
import { Team, TeamDocument } from './schemas/team.schema';
import { TeamsService } from './teams.service';
import { StatsUtils } from './utils/stats.utils';
import { UploadMediaInput, UpdateMediaInput, MediaFiltersInput } from './dto';
import { BunnyStorageService } from '../bunny/bunny-storage.service';
import { BunnyStreamService } from '../bunny/bunny-stream.service';
import { NotificationsService } from '../notifications/notifications.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import FileUpload from 'graphql-upload/Upload.mjs';
import { MediaCategory } from './schemas/media.schema';

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(Media.name) private mediaModel: Model<MediaDocument>,
    @InjectModel(MediaTag.name) private mediaTagModel: Model<MediaTagDocument>,
    @InjectModel(TeamMatch.name) private teamMatchModel: Model<TeamMatchDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private teamsService: TeamsService,
    private bunnyStorageService: BunnyStorageService,
    private bunnyStreamService: BunnyStreamService,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {}

  // ============== MEDIA ==============

  /**
   * Upload photo to Bunny Storage
   */
  async uploadPhoto(
    userId: string,
    matchId: string,
    file: any,
    category?: MediaCategory,
    isHighlight?: boolean,
  ): Promise<Media> {
    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, matchId);

    // Process file upload - handle both Promise and direct Upload
    const upload = file?.promise ? await file.promise : await file;
    const { createReadStream, filename, mimetype } = upload;
    
    // Validate file type
    if (!mimetype.startsWith('image/')) {
      throw new ForbiddenException('Only image files are allowed for photos');
    }

    // Read file to buffer
    const stream = createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Upload to Bunny Storage
    const uploadResult = await this.bunnyStorageService.uploadPhoto(buffer, filename, matchId);

    // Generate thumbnail URL
    const thumbnailUrl = this.bunnyStorageService.generateThumbnail(uploadResult.cdnUrl);

    // Create media record
    const media = await this.mediaModel.create({
      matchId: new Types.ObjectId(matchId),
      uploadedBy: new Types.ObjectId(userId),
      type: MediaType.PHOTO,
      url: uploadResult.cdnUrl,
      thumbnailUrl,
      storagePath: uploadResult.path,
      category,
      isHighlight: isHighlight || false,
      processingStatus: 'finished',
    });

    return media;
  }

  /**
   * Upload video to Bunny Stream
   */
  async uploadVideo(
    userId: string,
    matchId: string,
    file: any,
    category?: MediaCategory,
    isHighlight?: boolean,
  ): Promise<Media> {
    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, matchId);

    // Process file upload - handle both Promise and direct Upload
    const upload = file?.promise ? await file.promise : await file;
    const { createReadStream, filename, mimetype } = upload;
    
    // Validate file type
    if (!mimetype.startsWith('video/')) {
      throw new ForbiddenException('Only video files are allowed for videos');
    }

    // Read file to buffer
    const stream = createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Upload to Bunny Stream
    const uploadResult = await this.bunnyStreamService.uploadVideo(buffer, filename, matchId);

    // Create media record
    const media = await this.mediaModel.create({
      matchId: new Types.ObjectId(matchId),
      uploadedBy: new Types.ObjectId(userId),
      type: MediaType.VIDEO,
      url: uploadResult.url,
      thumbnailUrl: uploadResult.thumbnailUrl,
      embedUrl: uploadResult.embedUrl,
      videoId: uploadResult.videoId,
      category,
      isHighlight: isHighlight || false,
      processingStatus: uploadResult.status,
    });

    return media;
  }

  /**
   * Check and update video processing status from Bunny Stream
   * Called by polling from frontend
   */
  async updateVideoProcessingStatus(mediaId: string, userId: string): Promise<Media> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, media.matchId.toString());

    // Only update if it's a video and not already finished/failed
    if (media.type !== MediaType.VIDEO || !media.videoId) {
      return media;
    }

    if (media.processingStatus === 'finished' || media.processingStatus === 'failed') {
      return media;
    }

    try {
      // Get current status from Bunny Stream
      const videoStatus = await this.bunnyStreamService.getVideoStatus(media.videoId);

      // Update if status changed
      if (videoStatus.status !== media.processingStatus) {
        media.processingStatus = videoStatus.status;
        
        // Update duration if available
        if (videoStatus.duration && videoStatus.duration > 0) {
          media.duration = videoStatus.duration;
        }

        await media.save();
      }
    } catch (error) {
      console.error('Error checking Bunny Stream status:', error);
      // Don't throw, just return current media
    }

    return media;
  }

  /**
   * Upload photo from buffer (used by REST endpoint for real progress)
   */
  async uploadPhotoFromBuffer(
    userId: string,
    matchId: string,
    file: { buffer: Buffer; filename: string; mimetype: string },
    category?: MediaCategory,
    isHighlight?: boolean,
  ): Promise<Media> {
    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, matchId);

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      throw new ForbiddenException('Only image files are allowed for photos');
    }

    // Upload to Bunny Storage
    const uploadResult = await this.bunnyStorageService.uploadPhoto(
      file.buffer,
      file.filename,
      matchId,
    );

    // Generate thumbnail URL
    const thumbnailUrl = this.bunnyStorageService.generateThumbnail(uploadResult.cdnUrl);

    // Create media record
    const media = await this.mediaModel.create({
      matchId: new Types.ObjectId(matchId),
      uploadedBy: new Types.ObjectId(userId),
      type: MediaType.PHOTO,
      url: uploadResult.cdnUrl,
      thumbnailUrl,
      storagePath: uploadResult.path,
      category,
      isHighlight: isHighlight || false,
      processingStatus: 'finished',
    });

    return media;
  }

  /**
   * Upload video from buffer (used by REST endpoint for real progress)
   */
  async uploadVideoFromBuffer(
    userId: string,
    matchId: string,
    file: { buffer: Buffer; filename: string; mimetype: string },
    category?: MediaCategory,
    isHighlight?: boolean,
  ): Promise<Media> {
    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, matchId);

    // Validate file type
    if (!file.mimetype.startsWith('video/')) {
      throw new ForbiddenException('Only video files are allowed for videos');
    }

    // Upload to Bunny Stream
    const uploadResult = await this.bunnyStreamService.uploadVideo(
      file.buffer,
      file.filename,
      matchId,
    );

    // Create media record
    const media = await this.mediaModel.create({
      matchId: new Types.ObjectId(matchId),
      uploadedBy: new Types.ObjectId(userId),
      type: MediaType.VIDEO,
      url: uploadResult.url,
      thumbnailUrl: uploadResult.thumbnailUrl,
      embedUrl: uploadResult.embedUrl,
      videoId: uploadResult.videoId,
      category,
      isHighlight: isHighlight || false,
      processingStatus: uploadResult.status,
    });

    return media;
  }

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

    // Auto-update video status if it's processing
    if (
      media.type === MediaType.VIDEO && 
      media.videoId && 
      media.processingStatus !== 'finished' && 
      media.processingStatus !== 'failed'
    ) {
      try {
        const videoStatus = await this.bunnyStreamService.getVideoStatus(media.videoId);
        if (videoStatus.status !== media.processingStatus) {
          media.processingStatus = videoStatus.status;
          if (videoStatus.duration) media.duration = videoStatus.duration;
          await media.save();
        }
      } catch (error) {
        console.error('Error auto-updating video status:', error);
      }
    }

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

    // Delete from Bunny services
    if (media.type === MediaType.PHOTO && media.storagePath) {
      await this.bunnyStorageService.deletePhoto(media.storagePath);
    } else if (media.type === MediaType.VIDEO && media.videoId) {
      await this.bunnyStreamService.deleteVideo(media.videoId);
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

  async getMediaTags(mediaId: string): Promise<MediaTag[]> {
    return this.mediaTagModel.find({ mediaId: new Types.ObjectId(mediaId) });
  }

  async tagUsersInMedia(mediaId: string, userId: string, userIds: string[]): Promise<boolean> {
    const media = await this.mediaModel.findById(mediaId);

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(userId, media.matchId.toString());

    // Get tagger name for notifications
    const tagger = await this.userModel.findById(userId);
    const taggerName = tagger?.name || tagger?.userName || 'Alguien';

    // Get team name for notifications
    const match = await this.teamMatchModel.findById(media.matchId);
    let teamName: string | undefined;
    if (match) {
      const team = await this.teamModel.findById(match.teamId);
      teamName = team?.name;
    }

    // Determine media type for notification
    const mediaType = media.type === MediaType.VIDEO ? 'video' : 'photo';

    // Create tags (duplicates will be ignored due to unique index)
    const tagPromises = userIds.map(async (tagUserId) => {
      try {
        await this.mediaTagModel.create({
          mediaId: new Types.ObjectId(mediaId),
          userId: new Types.ObjectId(tagUserId),
          taggedBy: new Types.ObjectId(userId),
        });

        // Send notification to tagged user (don't block)
        this.notificationsService.notifyUserTagged(
          tagUserId,
          userId,
          taggerName,
          mediaId,
          mediaType,
          media.thumbnailUrl,
          teamName,
        ).catch(err => console.error('Failed to create tag notification:', err));

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

  /**
   * Get ALL media related to user:
   * - Media where user is tagged
   * - Media uploaded by user
   */
  async getAllMyMedia(userId: string, type?: MediaType): Promise<Media[]> {
    const userObjectId = new Types.ObjectId(userId);

    // Find all tags for this user
    const tags = await this.mediaTagModel.find({ userId: userObjectId });
    const taggedMediaIds = tags.map((t) => t.mediaId);

    // Build query: uploaded by me OR tagged in
    const query: any = {
      $or: [
        { uploadedBy: userObjectId },
        { _id: { $in: taggedMediaIds } },
      ],
    };

    if (type) {
      query.type = type;
    }

    // Get unique results sorted by date
    return this.mediaModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /**
   * Get profile stats including uploaded media
   */
  async getAllMyProfileStats(userId: string) {
    const userObjectId = new Types.ObjectId(userId);

    // Find all tags for this user
    const tags = await this.mediaTagModel.find({ userId: userObjectId });
    const taggedMediaIds = tags.map((t) => t.mediaId);

    // Query for all my media (uploaded + tagged)
    const myMediaQuery = {
      $or: [
        { uploadedBy: userObjectId },
        { _id: { $in: taggedMediaIds } },
      ],
    };

    const [goalCount, videoCount, photoCount] = await Promise.all([
      this.mediaModel.countDocuments({ ...myMediaQuery, category: 'GOAL' }),
      this.mediaModel.countDocuments({ ...myMediaQuery, type: 'VIDEO' }),
      this.mediaModel.countDocuments({ ...myMediaQuery, type: 'PHOTO' }),
    ]);

    return { goalCount, videoCount, photoCount };
  }

  async getProfileStats(userId: string) {
    return StatsUtils.getProfileStats(userId, this.mediaTagModel, this.mediaModel);
  }
}
