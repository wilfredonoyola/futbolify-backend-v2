import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { WorldcupResolver } from './worldcup.resolver';
import { QueriesService } from './queries/queries.service';
import { ChatService } from './chat/chat.service';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
    ]),
  ],
  providers: [QueriesService, ChatService, WorldcupResolver],
  exports: [QueriesService, ChatService],
})
export class WorldcupModule {}
