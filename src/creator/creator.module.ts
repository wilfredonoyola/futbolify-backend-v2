import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { BrandService } from './brand.service';
import { TemplateService } from './template.service';
import { ContentService } from './content.service';
import { BrandMemberService } from './brand-member.service';
import { PostsService } from './posts.service';
import { GenerationService } from './generation.service';
import { BrandResolver } from './brand.resolver';
import { TemplateResolver } from './template.resolver';
import { ContentResolver } from './content.resolver';
import { BrandMemberResolver } from './brand-member.resolver';
import { PostsResolver } from './posts.resolver';
import { Brand, BrandSchema } from './schemas/brand.schema';
import { Template, TemplateSchema } from './schemas/template.schema';
import { BrandMember, BrandMemberSchema } from './schemas/brand-member.schema';
import { BrandInvitation, BrandInvitationSchema } from './schemas/brand-invitation.schema';
import { Post, PostSchema } from './schemas/post.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => UsersModule),
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
    BrandMemberService,
    PostsService,
    GenerationService,
    BrandResolver,
    TemplateResolver,
    ContentResolver,
    BrandMemberResolver,
    PostsResolver,
  ],
  exports: [BrandService, TemplateService, ContentService, BrandMemberService, PostsService, GenerationService],
})
export class CreatorModule {}
