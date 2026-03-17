import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cache TTL constants in seconds
 */
export const CACHE_TTL = {
  STANDINGS: 3600, // 1 hour
  MATCH_LIST: 900, // 15 minutes
  MATCH_FINISHED: 86400, // 24 hours
  MATCH_UPCOMING: 900, // 15 minutes
  TEAM: 86400, // 24 hours
  NEWS: 3600, // 1 hour
  BROADCASTS: 86400, // 24 hours
  // Live matches (API-Football)
  LIVE_MATCHES: 60, // 1 minute
  LIVE_MATCH_DETAILS: 30, // 30 seconds
  RECENTLY_FINISHED: 300, // 5 minutes
};

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private readonly logger = new Logger(RedisCacheService.name);
  private isConnected = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      this.logger.warn('REDIS_URL not configured, cache disabled');
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis connection failed after 3 retries');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        this.logger.log('🔴 Redis cache connected');
      });

      this.redis.on('error', (error) => {
        this.logger.error(`Redis error: ${error.message}`);
        this.isConnected = false;
      });
    } catch (error) {
      this.logger.error(`Failed to initialize Redis: ${error.message}`);
    }
  }

  onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
      this.logger.log('Redis disconnected');
    }
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.redis) {
      return null;
    }

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.debug(`♻️ [REDIS CACHE HIT] ${key}`);
        return JSON.parse(cached) as T;
      }
      return null;
    } catch (error) {
      this.logger.error(`Redis get error for ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.isConnected || !this.redis) {
      return;
    }

    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      this.logger.debug(`💾 [REDIS CACHED] ${key} for ${ttlSeconds}s`);
    } catch (error) {
      this.logger.error(`Redis set error for ${key}: ${error.message}`);
    }
  }

  /**
   * Delete a specific key
   */
  async delete(key: string): Promise<void> {
    if (!this.isConnected || !this.redis) {
      return;
    }

    try {
      await this.redis.del(key);
      this.logger.debug(`🗑️ [REDIS DELETED] ${key}`);
    } catch (error) {
      this.logger.error(`Redis delete error for ${key}: ${error.message}`);
    }
  }

  /**
   * Delete all keys matching a pattern
   * Use with caution - scans entire keyspace
   */
  async deletePattern(pattern: string): Promise<void> {
    if (!this.isConnected || !this.redis) {
      return;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(
          `🗑️ [REDIS DELETED] ${keys.length} keys matching ${pattern}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Redis deletePattern error for ${pattern}: ${error.message}`,
      );
    }
  }

  /**
   * Check if cache is available
   */
  isAvailable(): boolean {
    return this.isConnected;
  }
}
