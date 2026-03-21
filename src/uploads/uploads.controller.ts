import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MediaService } from '../teams/media.service';
import { MediaCategory } from '../teams/schemas/media.schema';
import { BunnyStorageService } from '../bunny/bunny-storage.service';
import { BunnyStreamService } from '../bunny/bunny-stream.service';
import { UsersService } from '../users/users.service';
import { QuinielaService } from '../quiniela/quiniela.service';

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly bunnyStorageService: BunnyStorageService,
    private readonly bunnyStreamService: BunnyStreamService,
    private readonly usersService: UsersService,
    private readonly quinielaService: QuinielaService,
  ) {}

  /**
   * Upload photo with real progress tracking
   * POST /uploads/photo
   */
  @Post('photo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Body('matchId') matchId: string,
    @Body('category') category: string,
    @Body('isHighlight') isHighlight: string,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!matchId) {
      throw new BadRequestException('matchId is required');
    }

    // Convert file to format expected by service
    const fileUpload = {
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
    };

    // Handle category - ignore if undefined, null, empty, or "undefined" string
    const validCategory = category && category !== 'undefined' && category !== 'null' && category.trim() !== ''
      ? (category.toUpperCase() as MediaCategory)
      : undefined;

    const media = await this.mediaService.uploadPhotoFromBuffer(
      req.user.userId,
      matchId,
      fileUpload,
      validCategory,
      isHighlight === 'true',
    );

    return {
      success: true,
      data: media,
    };
  }

  /**
   * Upload video with real progress tracking
   * POST /uploads/video
   */
  @Post('video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body('matchId') matchId: string,
    @Body('category') category: string,
    @Body('isHighlight') isHighlight: string,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!matchId) {
      throw new BadRequestException('matchId is required');
    }

    // Convert file to format expected by service
    const fileUpload = {
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
    };

    // Handle category - ignore if undefined, null, empty, or "undefined" string
    const validCategory = category && category !== 'undefined' && category !== 'null' && category.trim() !== ''
      ? (category.toUpperCase() as MediaCategory)
      : undefined;

    const media = await this.mediaService.uploadVideoFromBuffer(
      req.user.userId,
      matchId,
      fileUpload,
      validCategory,
      isHighlight === 'true',
    );

    return {
      success: true,
      data: media,
    };
  }

  /**
   * Upload user avatar
   * POST /uploads/avatar
   */
  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 2MB');
    }

    const userId = req.user.userId;

    // Upload to Bunny Storage
    const result = await this.bunnyStorageService.uploadAvatar(
      file.buffer,
      file.originalname,
      userId,
    );

    // Update user's avatarUrl in database
    await this.usersService.update(
      userId,
      { avatarUrl: result.cdnUrl },
      req.user,
    );

    return {
      success: true,
      data: {
        url: result.cdnUrl,
        path: result.path,
      },
    };
  }

  /**
   * Upload image for a feed post (no matchId required)
   * POST /uploads/post-image
   */
  @Post('post-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadPostImage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    // Validate file size (max 5MB for post images)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 5MB');
    }

    const userId = req.user.userId;
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop() || 'jpg';
    const filename = `${timestamp}.${ext}`;

    // Upload to Bunny Storage in feed/posts/{userId}/ folder
    const result = await this.bunnyStorageService.uploadFile(
      file.buffer,
      `feed/posts/${userId}/${filename}`,
      file.mimetype,
    );

    return {
      success: true,
      url: result.cdnUrl,
      path: result.path,
    };
  }

  /**
   * Upload video for a feed post (no matchId required)
   * Uses Bunny Storage (same as images) for direct CDN access
   * POST /uploads/post-video
   */
  @Post('post-video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadPostVideo(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    if (!file.mimetype.startsWith('video/')) {
      throw new BadRequestException('Only video files are allowed');
    }

    // Validate file size (max 100MB for post videos)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 100MB');
    }

    const userId = req.user.userId;
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop() || 'mp4';
    const filename = `${timestamp}.${ext}`;

    // Upload to Bunny Storage (same as images) - direct CDN URL, no auth needed
    const result = await this.bunnyStorageService.uploadFile(
      file.buffer,
      `feed/posts/${userId}/videos/${filename}`,
      file.mimetype,
    );

    return {
      success: true,
      videoUrl: result.cdnUrl,
      url: result.cdnUrl,
      path: result.path,
      status: 'finished', // No processing needed, ready immediately
    };
  }

  /**
   * Check video processing status
   * GET /uploads/video-status/:videoId
   *
   * Returns: { videoId, status, thumbnailUrl, embedUrl, duration }
   * Status values: 'processing', 'finished', 'failed'
   */
  @Get('video-status/:videoId')
  @UseGuards(JwtAuthGuard)
  async getVideoStatus(@Param('videoId') videoId: string) {
    if (!videoId) {
      throw new BadRequestException('videoId is required');
    }

    const status = await this.bunnyStreamService.getVideoStatus(videoId);

    return {
      success: true,
      ...status,
    };
  }

  /**
   * Upload quiniela image/logo
   * POST /uploads/quiniela-image
   */
  @Post('quiniela-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadQuinielaImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('quinielaId') quinielaId: string,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!quinielaId) {
      throw new BadRequestException('quinielaId is required');
    }

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size must be less than 2MB');
    }

    // Upload to Bunny Storage
    const result = await this.bunnyStorageService.uploadQuinielaImage(
      file.buffer,
      file.originalname,
      quinielaId,
    );

    // Update quiniela's imageUrl in database
    await this.quinielaService.updateQuiniela(
      quinielaId,
      req.user.userId,
      { imageUrl: result.cdnUrl },
    );

    return {
      success: true,
      data: {
        url: result.cdnUrl,
        path: result.path,
      },
    };
  }
}
