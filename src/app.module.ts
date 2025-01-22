import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InventoryModule } from './inventory/inventory.module';
import { ServiceModule } from './services/service.module';
import { CategoryModule } from './category/category.module';
import { PosModule } from './pos/pos.module';
import { CompanyModule } from './company/company.module';
import { CommercialInvoicePosModule } from './comercialInvoice/comercialInvoice.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      playground: true,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
    }),
    AuthModule,
    UsersModule,
    InventoryModule,
    ServiceModule,
    CategoryModule,
    PosModule,
    CompanyModule,
    CommercialInvoicePosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
