import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeedService } from './feed.service';
import { FeedResolver } from './feed.resolver';
import { Quiniela, QuinielaSchema } from '../quiniela/schemas/quiniela.schema';
import { WorldcupModule } from '../worldcup/worldcup.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quiniela.name, schema: QuinielaSchema },
    ]),
    WorldcupModule,
  ],
  providers: [FeedService, FeedResolver],
  exports: [FeedService],
})
export class FeedModule {}
