import { forwardRef, Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyResolver } from './company.resolver';
import { AuthModule } from 'src/auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { CompanySchema } from './schemas/company.schema';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Company', schema: CompanySchema }]),
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  providers: [CompanyResolver, CompanyService],
  exports: [CompanyService], // Exporta CompanyService
})
export class CompanyModule {}
