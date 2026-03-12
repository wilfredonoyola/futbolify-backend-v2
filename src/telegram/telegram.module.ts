// Telegram Module - Bot integration for Futbolify Quinielas

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { PlatformLink, PlatformLinkSchema } from './schemas/platform-link.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Quiniela, QuinielaSchema } from '../quiniela/schemas/quiniela.schema';
import { WorldcupModule } from '../worldcup/worldcup.module';
import { QuinielaModule } from '../quiniela/quiniela.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PlatformLink.name, schema: PlatformLinkSchema },
      { name: User.name, schema: UserSchema },
      { name: Quiniela.name, schema: QuinielaSchema },
    ]),
    WorldcupModule,
    QuinielaModule,
  ],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
