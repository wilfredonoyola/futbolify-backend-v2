import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import { Readable } from 'stream';

export interface UploadResult {
  url: string;
  cdnUrl: string;
  path: string;
}

@Injectable()
export class BunnyStorageService {
  private readonly storageZoneName: string;
  private readonly accessKey: string;
  private readonly region: string;
  private readonly cdnHostname: string;

  constructor(private configService: ConfigService) {
    this.storageZoneName = this.configService.get<string>('BUNNY_STORAGE_ZONE_NAME') || '';
    this.accessKey = this.configService.get<string>('BUNNY_STORAGE_API_KEY') || '';
    this.region = this.configService.get<string>('BUNNY_STORAGE_REGION') || 'storage';
    this.cdnHostname = this.configService.get<string>('BUNNY_STORAGE_HOSTNAME') || '';

    if (!this.storageZoneName || !this.accessKey || !this.cdnHostname) {
      console.warn('⚠️  Bunny Storage not configured. Photo uploads will not work until configured.');
    }
  }

  private checkConfiguration() {
    if (!this.storageZoneName || !this.accessKey || !this.cdnHostname) {
      throw new InternalServerErrorException(
        'Bunny Storage not configured. Please add BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_API_KEY, and BUNNY_STORAGE_HOSTNAME to environment variables.'
      );
    }
  }

  /**
   * Uploads a photo to Bunny Storage
   * @param file - File stream or buffer
   * @param filename - Original filename
   * @param matchId - Match ID for organizing files
   * @returns Upload result with URLs
   */
  async uploadPhoto(
    file: Buffer | Readable,
    filename: string,
    matchId: string,
  ): Promise<UploadResult> {
    this.checkConfiguration();
    try {
      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const ext = filename.split('.').pop() || 'jpg';
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `matches/${matchId}/photos/${timestamp}_${sanitizedFilename}`;

      // Upload to Bunny Storage
      const storageUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${path}`;
      
      const response = await axios.put(storageUrl, file, {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': `image/${ext}`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (response.status !== 201) {
        throw new InternalServerErrorException('Failed to upload photo to Bunny Storage');
      }

      // Generate CDN URL
      const cdnUrl = `https://${this.cdnHostname}/${path}`;

      return {
        url: cdnUrl,
        cdnUrl,
        path,
      };
    } catch (error) {
      console.error('Bunny Storage upload error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to upload photo: ${error.response?.data?.Message || error.message}`,
      );
    }
  }

  /**
   * Deletes a photo from Bunny Storage
   * @param path - File path in storage
   */
  async deletePhoto(path: string): Promise<boolean> {
    try {
      const storageUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${path}`;
      
      const response = await axios.delete(storageUrl, {
        headers: {
          'AccessKey': this.accessKey,
        },
      });

      return response.status === 200 || response.status === 204;
    } catch (error) {
      console.error('Bunny Storage delete error:', error.response?.data || error.message);
      // Don't throw error on delete failure, just log it
      return false;
    }
  }

  /**
   * Lists files in a directory
   * @param directory - Directory path
   */
  async listFiles(directory: string): Promise<any[]> {
    try {
      const storageUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${directory}/`;
      
      const response = await axios.get(storageUrl, {
        headers: {
          'AccessKey': this.accessKey,
        },
      });

      return response.data || [];
    } catch (error) {
      console.error('Bunny Storage list error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Generates a thumbnail URL for an image
   * Note: Bunny Storage doesn't support image transformation.
   * Use the original URL and resize with CSS on frontend.
   * @param cdnUrl - Original CDN URL
   */
  generateThumbnail(cdnUrl: string): string {
    // Bunny Storage basic doesn't support image transformations
    // Return original URL - frontend handles display sizing with CSS
    return cdnUrl;
  }

  /**
   * Uploads a template thumbnail to Bunny Storage (overwrites existing)
   * Uses a fixed path per template so each upload overwrites the previous thumbnail
   * @param base64Data - Base64 encoded image data (with or without data URL prefix)
   * @param templateId - Template ID for organizing files
   * @param format - Image format (png, jpg, webp)
   * @returns Upload result with URLs (includes cache-busting timestamp)
   */
  async uploadTemplateThumbnail(
    base64Data: string,
    templateId: string,
    format: 'png' | 'jpg' | 'webp' = 'png',
  ): Promise<UploadResult> {
    this.checkConfiguration();

    try {
      // Remove data URL prefix if present
      const base64Content = base64Data.includes('base64,')
        ? base64Data.split('base64,')[1]
        : base64Data;

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Content, 'base64');

      // Fixed path per template - overwrites on each upload
      const path = `templates/thumbnails/${templateId}.${format}`;

      // Upload to Bunny Storage (PUT overwrites existing file)
      const storageUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${path}`;

      const contentType = format === 'jpg' ? 'image/jpeg' : `image/${format}`;

      const response = await axios.put(storageUrl, buffer, {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': contentType,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      // Bunny returns 201 for new files, 200 for overwrites
      if (response.status !== 201 && response.status !== 200) {
        throw new InternalServerErrorException('Failed to upload thumbnail to Bunny Storage');
      }

      // Generate CDN URL with cache-busting timestamp
      const timestamp = Date.now();
      const cdnUrl = `https://${this.cdnHostname}/${path}?v=${timestamp}`;

      return {
        url: `https://${this.cdnHostname}/${path}`,
        cdnUrl, // URL with cache-busting param
        path,
      };
    } catch (error) {
      console.error('Bunny Storage thumbnail upload error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to upload thumbnail: ${error.response?.data?.Message || error.message}`,
      );
    }
  }

  /**
   * Uploads a template image (background, element) to Bunny Storage
   * Uses unique filename with imageId to allow multiple images per template
   * @param base64Data - Base64 encoded image data (with or without data URL prefix)
   * @param templateId - Template ID for organizing files
   * @param imageId - Unique ID for this specific image (e.g., element ID or 'background')
   * @param format - Image format (png, jpg, webp)
   * @returns Upload result with URLs
   */
  async uploadTemplateImage(
    base64Data: string,
    templateId: string,
    imageId: string,
    format: 'png' | 'jpg' | 'webp' = 'png',
  ): Promise<UploadResult> {
    this.checkConfiguration();

    try {
      // Remove data URL prefix if present
      const base64Content = base64Data.includes('base64,')
        ? base64Data.split('base64,')[1]
        : base64Data;

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Content, 'base64');

      // Path includes imageId for uniqueness
      const path = `templates/images/${templateId}/${imageId}.${format}`;

      // Upload to Bunny Storage
      const storageUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${path}`;

      const contentType = format === 'jpg' ? 'image/jpeg' : `image/${format}`;

      const response = await axios.put(storageUrl, buffer, {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': contentType,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (response.status !== 201 && response.status !== 200) {
        throw new InternalServerErrorException('Failed to upload image to Bunny Storage');
      }

      // Generate CDN URL with cache-busting timestamp
      const timestamp = Date.now();
      const cdnUrl = `https://${this.cdnHostname}/${path}?v=${timestamp}`;

      return {
        url: `https://${this.cdnHostname}/${path}`,
        cdnUrl,
        path,
      };
    } catch (error) {
      console.error('Bunny Storage image upload error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to upload image: ${error.response?.data?.Message || error.message}`,
      );
    }
  }

  /**
   * Deletes a template image from Bunny Storage
   * @param path - File path in storage (e.g., templates/images/templateId/imageId.jpg)
   * @returns true if deleted, false if failed
   */
  async deleteTemplateImage(path: string): Promise<boolean> {
    try {
      // Allow deleting without full config check for cleanup operations
      if (!this.storageZoneName || !this.accessKey) {
        console.warn('Bunny Storage not configured, skipping delete');
        return false;
      }

      const storageUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${path}`;

      const response = await axios.delete(storageUrl, {
        headers: {
          'AccessKey': this.accessKey,
        },
      });

      console.log(`[Bunny] Deleted image: ${path}`);
      return response.status === 200 || response.status === 204;
    } catch (error) {
      console.error('Bunny Storage delete error:', error.response?.data || error.message);
      // Don't throw error on delete failure, just log it
      return false;
    }
  }

  /**
   * Deletes multiple template images from Bunny Storage
   * @param paths - Array of file paths to delete
   * @returns number of successfully deleted files
   */
  async deleteTemplateImages(paths: string[]): Promise<number> {
    let deletedCount = 0;

    for (const path of paths) {
      const deleted = await this.deleteTemplateImage(path);
      if (deleted) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Uploads a user avatar to Bunny Storage
   * @param file - File buffer
   * @param filename - Original filename
   * @param userId - User ID for organizing files
   * @returns Upload result with URLs
   */
  async uploadAvatar(
    file: Buffer,
    filename: string,
    userId: string,
  ): Promise<UploadResult> {
    this.checkConfiguration();

    try {
      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `avatars/${userId}/${timestamp}.${ext}`;

      // Upload to Bunny Storage
      const storageUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${path}`;

      const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;

      const response = await axios.put(storageUrl, file, {
        headers: {
          'AccessKey': this.accessKey,
          'Content-Type': contentType,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (response.status !== 201 && response.status !== 200) {
        throw new InternalServerErrorException('Failed to upload avatar to Bunny Storage');
      }

      // Generate CDN URL with cache-busting timestamp
      const cdnUrl = `https://${this.cdnHostname}/${path}?v=${timestamp}`;

      return {
        url: `https://${this.cdnHostname}/${path}`,
        cdnUrl,
        path,
      };
    } catch (error) {
      console.error('Bunny Storage avatar upload error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to upload avatar: ${error.response?.data?.Message || error.message}`,
      );
    }
  }

  /**
   * Deletes old avatar from Bunny Storage
   * @param path - File path in storage
   */
  async deleteAvatar(path: string): Promise<boolean> {
    try {
      if (!path || !this.storageZoneName || !this.accessKey) {
        return false;
      }

      const storageUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${path}`;

      const response = await axios.delete(storageUrl, {
        headers: {
          'AccessKey': this.accessKey,
        },
      });

      console.log(`[Bunny] Deleted avatar: ${path}`);
      return response.status === 200 || response.status === 204;
    } catch (error) {
      console.error('Bunny Storage avatar delete error:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Get direct upload info for frontend to upload directly to Bunny
   * @param path - File path in storage
   */
  getDirectUploadInfo(path: string): { uploadUrl: string; cdnUrl: string; headers: Record<string, string> } {
    this.checkConfiguration();
    
    const uploadUrl = `https://${this.region}.bunnycdn.com/${this.storageZoneName}/${path}`;
    const cdnUrl = `https://${this.cdnHostname}/${path}`;
    
    return {
      uploadUrl,
      cdnUrl,
      headers: {
        'AccessKey': this.accessKey,
      },
    };
  }

  /**
   * Get the API key (for direct upload headers)
   */
  getApiKey(): string {
    return this.accessKey;
  }
}
