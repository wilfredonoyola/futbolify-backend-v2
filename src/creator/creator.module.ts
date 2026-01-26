import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BrandService } from './brand.service';
import { TemplateService } from './template.service';
import { BrandResolver } from './brand.resolver';
import { TemplateResolver } from './template.resolver';
import { Brand, BrandSchema } from './schemas/brand.schema';
import { Template, TemplateSchema } from './schemas/template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Brand.name, schema: BrandSchema },
      { name: Template.name, schema: TemplateSchema },
    ]),
  ],
  providers: [
    BrandService,
    TemplateService,
    BrandResolver,
    TemplateResolver,
  ],
  exports: [BrandService, TemplateService],
})
export class CreatorModule {}
