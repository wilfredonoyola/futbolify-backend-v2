import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadsController } from './uploads.controller';
import { DirectUploadController } from './direct-upload.controller';
import { TeamsModule } from '../teams/teams.module';
import { BunnyModule } from '../bunny/bunny.module';
import { Media, MediaSchema } from '../teams/schemas/media.schema';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max
      },
    }),
    MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]),
    TeamsModule,
    BunnyModule,
  ],
  controllers: [UploadsController, DirectUploadController],
})
export class UploadsModule {}
