import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamsService } from '../teams/teams.service';
import { BunnyStorageService } from '../bunny/bunny-storage.service';
import { BunnyStreamService } from '../bunny/bunny-stream.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Media, MediaDocument, MediaType, MediaCategory } from '../teams/schemas/media.schema';

/**
 * Controller for direct uploads to Bunny.net
 * Frontend uploads directly to Bunny, then registers the media here
 */
@Controller('direct-upload')
export class DirectUploadController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly bunnyStorageService: BunnyStorageService,
    private readonly bunnyStreamService: BunnyStreamService,
    @InjectModel(Media.name) private mediaModel: Model<MediaDocument>,
  ) {}

  /**
   * Get upload URL for photos (Bunny Storage)
   * POST /direct-upload/photo/init
   */
  @Post('photo/init')
  @UseGuards(JwtAuthGuard)
  async initPhotoUpload(
    @Body('matchId') matchId: string,
    @Body('filename') filename: string,
    @Request() req: any,
  ) {
    if (!matchId || !filename) {
      throw new BadRequestException('matchId and filename are required');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(req.user.userId, matchId);

    // Generate upload URL and path
    const timestamp = Date.now();
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `matches/${matchId}/photos/${timestamp}_${safeFilename}`;
    
    const uploadInfo = this.bunnyStorageService.getDirectUploadInfo(path);

    return {
      success: true,
      uploadUrl: uploadInfo.uploadUrl,
      cdnUrl: uploadInfo.cdnUrl,
      path: path,
      headers: uploadInfo.headers,
    };
  }

  /**
   * Get upload URL for videos (Bunny Stream)
   * POST /direct-upload/video/init
   */
  @Post('video/init')
  @UseGuards(JwtAuthGuard)
  async initVideoUpload(
    @Body('matchId') matchId: string,
    @Body('filename') filename: string,
    @Request() req: any,
  ) {
    if (!matchId || !filename) {
      throw new BadRequestException('matchId and filename are required');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(req.user.userId, matchId);

    // Create video in Bunny Stream and get upload URL
    const title = `Match ${matchId} - ${filename}`;
    const { videoId, uploadUrl } = await this.bunnyStreamService.createVideo(title);

    return {
      success: true,
      uploadUrl: uploadUrl,
      videoId: videoId,
      headers: {
        'AccessKey': this.bunnyStreamService.getApiKey(),
      },
    };
  }

  /**
   * Register photo after direct upload to Bunny Storage
   * POST /direct-upload/photo/complete
   */
  @Post('photo/complete')
  @UseGuards(JwtAuthGuard)
  async completePhotoUpload(
    @Body('matchId') matchId: string,
    @Body('path') path: string,
    @Body('cdnUrl') cdnUrl: string,
    @Body('category') category: string,
    @Body('isHighlight') isHighlight: boolean,
    @Request() req: any,
  ) {
    if (!matchId || !path || !cdnUrl) {
      throw new BadRequestException('matchId, path, and cdnUrl are required');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(req.user.userId, matchId);

    // Validate category
    const validCategory = category && category !== 'undefined' && category !== 'null' && category.trim() !== ''
      ? (category.toUpperCase() as MediaCategory)
      : undefined;

    // Generate thumbnail URL
    const thumbnailUrl = this.bunnyStorageService.generateThumbnail(cdnUrl);

    // Create media record
    const media = await this.mediaModel.create({
      matchId: new Types.ObjectId(matchId),
      uploadedBy: new Types.ObjectId(req.user.userId),
      type: MediaType.PHOTO,
      url: cdnUrl,
      thumbnailUrl,
      storagePath: path,
      category: validCategory,
      isHighlight: isHighlight || false,
      processingStatus: 'finished',
    });

    return {
      success: true,
      data: media,
    };
  }

  /**
   * Register video after direct upload to Bunny Stream
   * POST /direct-upload/video/complete
   */
  @Post('video/complete')
  @UseGuards(JwtAuthGuard)
  async completeVideoUpload(
    @Body('matchId') matchId: string,
    @Body('videoId') videoId: string,
    @Body('category') category: string,
    @Body('isHighlight') isHighlight: boolean,
    @Request() req: any,
  ) {
    if (!matchId || !videoId) {
      throw new BadRequestException('matchId and videoId are required');
    }

    // Verify user is a member of the match's team
    await this.teamsService.verifyMatchTeamMember(req.user.userId, matchId);

    // Validate category
    const validCategory = category && category !== 'undefined' && category !== 'null' && category.trim() !== ''
      ? (category.toUpperCase() as MediaCategory)
      : undefined;

    // Get video info from Bunny Stream
    const videoInfo = await this.bunnyStreamService.getVideoStatus(videoId);

    // Create media record
    const media = await this.mediaModel.create({
      matchId: new Types.ObjectId(matchId),
      uploadedBy: new Types.ObjectId(req.user.userId),
      type: MediaType.VIDEO,
      url: videoInfo.embedUrl,
      thumbnailUrl: videoInfo.thumbnailUrl,
      embedUrl: videoInfo.embedUrl,
      videoId: videoId,
      category: validCategory,
      isHighlight: isHighlight || false,
      processingStatus: 'processing', // Videos start as processing
    });

    return {
      success: true,
      data: media,
    };
  }
}
