import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamsService } from './teams.service';
import { MediaService } from './media.service';
import { PendingTagService } from './pending-tag.service';
import { TeamsResolver } from './teams.resolver';
import { MediaResolver } from './media.resolver';
import { PendingTagResolver } from './pending-tag.resolver';
import { Team, TeamSchema } from './schemas/team.schema';
import { TeamMember, TeamMemberSchema } from './schemas/team-member.schema';
import { TeamMatch, TeamMatchSchema } from './schemas/team-match.schema';
import { Media, MediaSchema } from './schemas/media.schema';
import { MediaTag, MediaTagSchema } from './schemas/media-tag.schema';
import { PendingTag, PendingTagSchema } from './schemas/pending-tag.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { TeamMemberGuard } from './guards/team-member.guard';
import { TeamAdminGuard } from './guards/team-admin.guard';
import { BunnyModule } from '../bunny/bunny.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Team.name, schema: TeamSchema },
      { name: TeamMember.name, schema: TeamMemberSchema },
      { name: TeamMatch.name, schema: TeamMatchSchema },
      { name: Media.name, schema: MediaSchema },
      { name: MediaTag.name, schema: MediaTagSchema },
      { name: PendingTag.name, schema: PendingTagSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BunnyModule,
  ],
  providers: [
    TeamsService,
    MediaService,
    PendingTagService,
    TeamsResolver,
    MediaResolver,
    PendingTagResolver,
    TeamMemberGuard,
    TeamAdminGuard,
  ],
  exports: [TeamsService, MediaService, PendingTagService],
})
export class TeamsModule {}

