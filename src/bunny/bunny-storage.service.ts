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
