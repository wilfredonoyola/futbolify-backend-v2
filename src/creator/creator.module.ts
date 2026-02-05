import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { BrandService } from './brand.service';
import { TemplateService } from './template.service';
import { ContentService } from './content.service';
import { ContentClaimService } from './content-claim.service';
import { ContentAnalyzerService } from './content-analyzer.service';
import { MatchContextService } from './match-context.service';
import { LiveMatchService } from './live-match.service';
import { BrandMemberService } from './brand-member.service';
import { PostsService } from './posts.service';
import { GenerationService } from './generation.service';
import { BrandResolver } from './brand.resolver';
import { TemplateResolver } from './template.resolver';
import { ContentResolver } from './content.resolver';
import { BrandMemberResolver } from './brand-member.resolver';
import { PostsResolver } from './posts.resolver';
import { LiveMatchResolver } from './live-match.resolver';
import { ViralContentService } from './viral-content.service';
import { ViralContentResolver } from './viral-content.resolver';
import { Brand, BrandSchema } from './schemas/brand.schema';
import { Template, TemplateSchema } from './schemas/template.schema';
import { BrandMember, BrandMemberSchema } from './schemas/brand-member.schema';
import { BrandInvitation, BrandInvitationSchema } from './schemas/brand-invitation.schema';
import { Post, PostSchema } from './schemas/post.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { BunnyModule } from '../bunny/bunny.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => UsersModule),
    BunnyModule,
    MongooseModule.forFeature([
      { name: Brand.name, schema: BrandSchema },
      { name: Template.name, schema: TemplateSchema },
      { name: BrandMember.name, schema: BrandMemberSchema },
      { name: BrandInvitation.name, schema: BrandInvitationSchema },
      { name: Post.name, schema: PostSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [
    BrandService,
    TemplateService,
    ContentService,
    ContentClaimService,
    ContentAnalyzerService,
    MatchContextService,
    LiveMatchService,
    BrandMemberService,
    PostsService,
    GenerationService,
    BrandResolver,
    TemplateResolver,
    ContentResolver,
    BrandMemberResolver,
    PostsResolver,
    LiveMatchResolver,
    ViralContentService,
    ViralContentResolver,
  ],
  exports: [BrandService, TemplateService, ContentService, ContentAnalyzerService, BrandMemberService, PostsService, GenerationService],
})
export class CreatorModule implements OnModuleInit {
  constructor(
    private readonly contentService: ContentService,
    private readonly contentAnalyzer: ContentAnalyzerService,
    private readonly matchContextService: MatchContextService,
  ) {}

  onModuleInit() {
    // Wire up the content analyzer to the content service
    this.contentService.setContentAnalyzer(this.contentAnalyzer);
    // Wire up the match context service to the content analyzer and content service
    this.contentAnalyzer.setMatchContextService(this.matchContextService);
    this.contentService.setMatchContextService(this.matchContextService);
  }
}
