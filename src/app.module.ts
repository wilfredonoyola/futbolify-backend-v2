// src/app.module.ts

import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { join } from 'path'

import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { MatchesModule } from './matches/matches.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ScheduleModule } from '@nestjs/schedule'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ✅ ConfigModule para cargar variables de entorno automáticamente
    ConfigModule.forRoot({
      isGlobal: true, // disponible globalmente
      envFilePath: '.env', // puedes omitirlo si usas el nombre estándar ".env"
    }),

    // ✅ Conexión a MongoDB de manera asíncrona
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),

    // ✅ Configuración de GraphQL
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      playground: true,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
    }),

    // ✅ Tus módulos propios
    AuthModule,
    UsersModule,
    MatchesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
