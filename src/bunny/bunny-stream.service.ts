import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import { Readable } from 'stream';
import * as crypto from 'crypto';

export interface VideoUploadResult {
  videoId: string;
  url: string;
  thumbnailUrl: string;
  embedUrl: string;
  status: string;
}

export interface VideoStatus {
  videoId: string;
  status: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
  embedUrl: string;
}

@Injectable()
export class BunnyStreamService {
  private readonly libraryId: string;
  private readonly apiKey: string;
  private readonly cdnHostname: string;
  private readonly tokenAuthKey: string;

  constructor(private configService: ConfigService) {
    this.libraryId = this.configService.get<string>('BUNNY_STREAM_LIBRARY_ID') || '';
    this.apiKey = this.configService.get<string>('BUNNY_STREAM_API_KEY') || '';
    this.cdnHostname = this.configService.get<string>('BUNNY_STREAM_HOSTNAME') || '';
    this.tokenAuthKey = this.configService.get<string>('BUNNY_STREAM_TOKEN_AUTH_KEY') || '';

    if (!this.libraryId || !this.apiKey || !this.cdnHostname) {
      console.warn('⚠️  Bunny Stream not configured. Video uploads will not work until configured.');
    }

    if (!this.tokenAuthKey) {
      console.warn('⚠️  BUNNY_STREAM_TOKEN_AUTH_KEY not set. Videos may not play if Token Auth is enabled.');
    }
  }

  /**
   * Signs a URL for Bunny Stream Token Authentication
   * @param url - The URL to sign
   * @param expirationTime - Token expiration in seconds (default 24 hours)
   */
  private signUrl(url: string, expirationTime: number = 86400): string {
    if (!this.tokenAuthKey) {
      // No token auth key, return unsigned URL
      return url;
    }

    const expires = Math.floor(Date.now() / 1000) + expirationTime;
    const parsedUrl = new URL(url);
    const signaturePath = parsedUrl.pathname;

    // Create signature: SHA256(securityKey + signaturePath + expires)
    const hashableBase = `${this.tokenAuthKey}${signaturePath}${expires}`;
    const token = crypto
      .createHash('sha256')
      .update(hashableBase)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Append token and expires to URL
    const separator = parsedUrl.search ? '&' : '?';
    return `${url}${separator}token=${token}&expires=${expires}`;
  }

  /**
   * Generates signed URLs for a video
   */
  generateSignedUrls(videoId: string): { playUrl: string; thumbnailUrl: string } {
    const playUrl = `https://${this.cdnHostname}/${videoId}/playlist.m3u8`;
    const thumbnailUrl = `https://${this.cdnHostname}/${videoId}/thumbnail.jpg`;

    return {
      playUrl: this.signUrl(playUrl),
      thumbnailUrl: this.signUrl(thumbnailUrl),
    };
  }

  private checkConfiguration() {
    if (!this.libraryId || !this.apiKey || !this.cdnHostname) {
      throw new InternalServerErrorException(
        'Bunny Stream not configured. Please add BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY, and BUNNY_STREAM_HOSTNAME to environment variables.'
      );
    }
  }

  /**
   * Creates a video in Bunny Stream and returns upload URL
   * @param title - Video title
   * @param collectionId - Optional collection ID for organizing videos
   */
  async createVideo(title: string, collectionId?: string): Promise<{ videoId: string; uploadUrl: string }> {
    this.checkConfiguration();
    try {
      const response = await axios.post(
        `https://video.bunnycdn.com/library/${this.libraryId}/videos`,
        {
          title,
          collectionId,
        },
        {
          headers: {
            'AccessKey': this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      const videoId = response.data.guid;
      
      return {
        videoId,
        uploadUrl: `https://video.bunnycdn.com/library/${this.libraryId}/videos/${videoId}`,
      };
    } catch (error) {
      console.error('Bunny Stream create video error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to create video: ${error.response?.data?.Message || error.message}`,
      );
    }
  }

  /**
   * Uploads a video file to Bunny Stream
   * @param file - Video file buffer or stream
   * @param filename - Original filename
   * @param matchId - Match ID for organizing videos
   */
  async uploadVideo(
    file: Buffer | Readable,
    filename: string,
    matchId: string,
  ): Promise<VideoUploadResult> {
    this.checkConfiguration();
    try {
      // Create video entry
      const title = `Match ${matchId} - ${filename}`;
      const { videoId, uploadUrl } = await this.createVideo(title);

      // Upload video file
      const response = await axios.put(uploadUrl, file, {
        headers: {
          'AccessKey': this.apiKey,
          'Content-Type': 'application/octet-stream',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (response.status !== 200) {
        throw new InternalServerErrorException('Failed to upload video to Bunny Stream');
      }

      // Generate signed URLs (if token auth is enabled)
      const signedUrls = this.generateSignedUrls(videoId);
      const embedUrl = `https://iframe.mediadelivery.net/embed/${this.libraryId}/${videoId}`;

      return {
        videoId,
        url: signedUrls.playUrl,
        thumbnailUrl: signedUrls.thumbnailUrl,
        embedUrl,
        status: 'processing',
      };
    } catch (error) {
      console.error('Bunny Stream upload error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to upload video: ${error.response?.data?.Message || error.message}`,
      );
    }
  }

  /**
   * Gets video status and metadata
   * @param videoId - Video ID from Bunny Stream
   */
  async getVideoStatus(videoId: string): Promise<VideoStatus> {
    try {
      const response = await axios.get(
        `https://video.bunnycdn.com/library/${this.libraryId}/videos/${videoId}`,
        {
          headers: {
            'AccessKey': this.apiKey,
          },
        },
      );

      const video = response.data;
      const signedUrls = this.generateSignedUrls(videoId);
      const embedUrl = `https://iframe.mediadelivery.net/embed/${this.libraryId}/${videoId}`;

      return {
        videoId: video.guid,
        status: this.mapStatus(video.status),
        title: video.title,
        duration: video.length,
        thumbnailUrl: signedUrls.thumbnailUrl,
        embedUrl,
      };
    } catch (error) {
      console.error('Bunny Stream get video error:', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Failed to get video status: ${error.response?.data?.Message || error.message}`,
      );
    }
  }

  /**
   * Deletes a video from Bunny Stream
   * @param videoId - Video ID
   */
  async deleteVideo(videoId: string): Promise<boolean> {
    try {
      const response = await axios.delete(
        `https://video.bunnycdn.com/library/${this.libraryId}/videos/${videoId}`,
        {
          headers: {
            'AccessKey': this.apiKey,
          },
        },
      );

      return response.status === 200 || response.status === 204;
    } catch (error) {
      console.error('Bunny Stream delete error:', error.response?.data || error.message);
      // Don't throw error on delete failure, just log it
      return false;
    }
  }

  /**
   * Lists videos in a collection
   * @param collectionId - Collection ID
   */
  async listVideos(collectionId?: string): Promise<any[]> {
    try {
      const url = collectionId
        ? `https://video.bunnycdn.com/library/${this.libraryId}/videos?collection=${collectionId}`
        : `https://video.bunnycdn.com/library/${this.libraryId}/videos`;

      const response = await axios.get(url, {
        headers: {
          'AccessKey': this.apiKey,
        },
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Bunny Stream list error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Maps Bunny Stream status codes to normalized status for frontend
   * Bunny codes: 0=queued, 1=processing, 2=encoding, 3=finished, 4=resolution_finished, 5=failed, 6=presigned_upload_waiting
   * Frontend expects: 'processing', 'finished', 'failed'
   */
  private mapStatus(status: number): string {
    // Normalize to: 'processing', 'finished', or 'failed'
    switch (status) {
      case 0: // queued
      case 1: // processing
      case 2: // encoding
      case 6: // presigned_upload_waiting
        return 'processing';
      case 3: // finished
      case 4: // resolution_finished (all resolutions encoded)
        return 'finished';
      case 5: // failed
        return 'failed';
      default:
        return 'processing'; // Unknown status, treat as processing
    }
  }

  /**
   * Generates an embed iframe HTML
   */
  generateEmbedHtml(videoId: string, width: number = 640, height: number = 360): string {
    return `<iframe src="https://iframe.mediadelivery.net/embed/${this.libraryId}/${videoId}" loading="lazy" style="border: none; position: absolute; top: 0; height: 100%; width: 100%;" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen="true"></iframe>`;
  }

  /**
   * Get the API key (for direct upload headers)
   */
  getApiKey(): string {
    return this.apiKey;
  }
}
