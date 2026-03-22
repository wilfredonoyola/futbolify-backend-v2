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
    console.log(`📸 POST /uploads/post-image - Starting image upload`);

    if (!file) {
      console.log(`❌ POST /uploads/post-image - No file provided`);
      throw new BadRequestException('No file provided');
    }

    console.log(`📸 POST /uploads/post-image - File: ${file.originalname}, Size: ${(file.size / 1024).toFixed(1)} KB, Type: ${file.mimetype}`);

    // Validate file type
    if (!file.mimetype.startsWith('image/')) {
      console.log(`❌ POST /uploads/post-image - Invalid file type: ${file.mimetype}`);
      throw new BadRequestException('Only image files are allowed');
    }

    // Validate file size (max 10MB for post images - increased from 5MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      console.log(`❌ POST /uploads/post-image - File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB`);
      throw new BadRequestException('File size must be less than 10MB');
    }

    const userId = req.user.userId;
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop() || 'jpg';
    const filename = `${timestamp}.${ext}`;

    try {
      // Upload to Bunny Storage in feed/posts/{userId}/ folder
      const result = await this.bunnyStorageService.uploadFile(
        file.buffer,
        `feed/posts/${userId}/${filename}`,
        file.mimetype,
      );

      console.log(`✅ POST /uploads/post-image - Upload successful: ${result.cdnUrl}`);

      return {
        success: true,
        url: result.cdnUrl,
        path: result.path,
      };
    } catch (error) {
      console.error(`❌ POST /uploads/post-image - Upload failed:`, error.message);
      throw error;
    }
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
    console.log(`🎬 POST /uploads/post-video - Starting video upload`);

    if (!file) {
      console.log(`❌ POST /uploads/post-video - No file provided`);
      throw new BadRequestException('No file provided');
    }

    const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
    console.log(`🎬 POST /uploads/post-video - File: ${file.originalname}, Size: ${fileSizeMB} MB, Type: ${file.mimetype}`);

    // Validate file type - check mimetype OR extension (iOS sometimes sends wrong mimetype)
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const validVideoExtensions = ['mp4', 'mov', 'avi', 'webm', 'm4v', '3gp', 'mkv'];
    const isVideoMimetype = file.mimetype.startsWith('video/') ||
                            file.mimetype === 'application/octet-stream' ||
                            file.mimetype === 'application/x-mpegURL';
    const isVideoExtension = validVideoExtensions.includes(ext);

    if (!isVideoMimetype && !isVideoExtension) {
      console.log(`❌ POST /uploads/post-video - Invalid file type: ${file.mimetype}, ext: ${ext}`);
      throw new BadRequestException(`Only video files are allowed. Received: ${file.mimetype}`);
    }

    // If mimetype is generic, try to determine from extension
    let finalMimetype = file.mimetype;
    if (file.mimetype === 'application/octet-stream' || !file.mimetype.startsWith('video/')) {
      const mimetypeMap = {
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'webm': 'video/webm',
        'm4v': 'video/x-m4v',
        '3gp': 'video/3gpp',
        'mkv': 'video/x-matroska',
      };
      finalMimetype = mimetypeMap[ext] || 'video/mp4';
      console.log(`🎬 POST /uploads/post-video - Corrected mimetype from ${file.mimetype} to ${finalMimetype}`);
    }

    // Validate file size (max 100MB for post videos)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      console.log(`❌ POST /uploads/post-video - File too large: ${fileSizeMB} MB`);
      throw new BadRequestException('File size must be less than 100MB');
    }

    const userId = req.user.userId;
    const timestamp = Date.now();
    const filename = `${timestamp}.${ext || 'mp4'}`;

    try {
      // Upload to Bunny Storage (same as images) - direct CDN URL, no auth needed
      console.log(`🎬 POST /uploads/post-video - Uploading ${fileSizeMB} MB to Bunny Storage...`);

      const result = await this.bunnyStorageService.uploadFile(
        file.buffer,
        `feed/posts/${userId}/videos/${filename}`,
        finalMimetype,
      );

      console.log(`✅ POST /uploads/post-video - Upload successful: ${result.cdnUrl}`);

      return {
        success: true,
        videoUrl: result.cdnUrl,
        url: result.cdnUrl,
        path: result.path,
        status: 'finished', // No processing needed, ready immediately
      };
    } catch (error) {
      console.error(`❌ POST /uploads/post-video - Upload failed:`, error.message);
      throw error;
    }
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
