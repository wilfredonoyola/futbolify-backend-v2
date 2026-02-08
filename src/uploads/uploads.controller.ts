import {
  Controller,
  Post,
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
import { UsersService } from '../users/users.service';

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly bunnyStorageService: BunnyStorageService,
    private readonly usersService: UsersService,
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
}
