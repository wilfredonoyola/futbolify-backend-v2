import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BunnyStorageService } from './bunny-storage.service';
import { BunnyStreamService } from './bunny-stream.service';

@Module({
  imports: [ConfigModule],
  providers: [BunnyStorageService, BunnyStreamService],
  exports: [BunnyStorageService, BunnyStreamService],
})
export class BunnyModule {}
