import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeedService } from './feed.service';
import { FeedResolver } from './feed.resolver';
import { Quiniela, QuinielaSchema } from '../quiniela/schemas/quiniela.schema';
import { UserPost, UserPostSchema } from './schemas/user-post.schema';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { WorldcupModule } from '../worldcup/worldcup.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quiniela.name, schema: QuinielaSchema },
      { name: UserPost.name, schema: UserPostSchema },
      { name: Comment.name, schema: CommentSchema },
    ]),
    WorldcupModule,
  ],
  providers: [FeedService, FeedResolver],
  exports: [FeedService],
})
export class FeedModule {}
