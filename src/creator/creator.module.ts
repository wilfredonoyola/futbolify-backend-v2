import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { BrandService } from './brand.service';
import { TemplateService } from './template.service';
import { ContentService } from './content.service';
import { BrandResolver } from './brand.resolver';
import { TemplateResolver } from './template.resolver';
import { ContentResolver } from './content.resolver';
import { Brand, BrandSchema } from './schemas/brand.schema';
import { Template, TemplateSchema } from './schemas/template.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Brand.name, schema: BrandSchema },
      { name: Template.name, schema: TemplateSchema },
    ]),
  ],
  providers: [
    BrandService,
    TemplateService,
    ContentService,
    BrandResolver,
    TemplateResolver,
    ContentResolver,
  ],
  exports: [BrandService, TemplateService, ContentService],
})
export class CreatorModule {}
