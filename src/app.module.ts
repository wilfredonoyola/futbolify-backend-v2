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
import { TeamsModule } from './teams/teams.module'
import { UploadsModule } from './uploads/uploads.module'
import { NotificationsModule } from './notifications/notifications.module'
import { CreatorModule } from './creator/creator.module'
import { StreamingModule } from './streaming/streaming.module'
import { FrasesModule } from './frases/frases.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  imports: [
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

    // ✅ Configuración de GraphQL con WebSocket subscriptions
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      playground: true,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
      csrfPrevention: false,
      subscriptions: {
        'graphql-ws': {
          onConnect: (context: { connectionParams?: { Authorization?: string } }) => {
            const { connectionParams } = context
            return { token: connectionParams?.Authorization }
          },
        },
      },
      context: ({ req, connection }: { req?: { headers: { authorization?: string } }; connection?: { context?: { token?: string } } }) => {
        if (connection) {
          return { req: { headers: { authorization: connection.context?.token } } }
        }
        return { req }
      },
    }),

    // ✅ Tus módulos propios
    AuthModule,
    UsersModule,
    MatchesModule,
    TeamsModule,
    UploadsModule,
    NotificationsModule,
    CreatorModule,
    StreamingModule,
    FrasesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
