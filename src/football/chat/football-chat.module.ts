// Football Chat Module
// Universal chat supporting all leagues + Mundial 2026 + Quinielas

import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { FootballChatService } from './football-chat.service';
import { FootballChatResolver } from './football-chat.resolver';
import { ApiFootballAdapter } from './adapters/api-football.adapter';
import { ChatSession, ChatSessionSchema } from '../../worldcup/schemas/chat-session.schema';
import { WorldcupModule } from '../../worldcup/worldcup.module';
import { QuinielaModule } from '../../quiniela/quiniela.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
    ]),
    forwardRef(() => WorldcupModule), // For QueriesService (Mundial 2026 data)
    forwardRef(() => QuinielaModule), // For QuinielaService (prediction pools)
  ],
  providers: [
    FootballChatService,
    FootballChatResolver,
    ApiFootballAdapter,
  ],
  exports: [FootballChatService],
})
export class FootballChatModule {}
