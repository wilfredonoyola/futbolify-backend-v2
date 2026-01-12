import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TeamsService } from './teams.service';
import { MediaService } from './media.service';
import { TeamsResolver } from './teams.resolver';
import { MediaResolver } from './media.resolver';
import { Team, TeamSchema } from './schemas/team.schema';
import { TeamMember, TeamMemberSchema } from './schemas/team-member.schema';
import { TeamMatch, TeamMatchSchema } from './schemas/team-match.schema';
import { Media, MediaSchema } from './schemas/media.schema';
import { MediaTag, MediaTagSchema } from './schemas/media-tag.schema';
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
    ]),
    BunnyModule,
  ],
  providers: [
    TeamsService,
    MediaService,
    TeamsResolver,
    MediaResolver,
    TeamMemberGuard,
    TeamAdminGuard,
  ],
  exports: [TeamsService, MediaService],
})
export class TeamsModule {}

