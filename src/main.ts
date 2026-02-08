import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ConfigService } from '@nestjs/config'
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs'
import { json, urlencoded } from 'express'

const logger = new Logger('App')

async function bootstrap() {
  Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose'])

  const app = await NestFactory.create(AppModule)

  // Increase body size limit for base64 image uploads (thumbnails, template images)
  app.use(json({ limit: '50mb' }))
  app.use(urlencoded({ extended: true, limit: '50mb' }))

  // Enable graphql-upload middleware ONLY for /graphql route
  // This prevents conflict with REST multipart uploads at /uploads/*
  app.use('/graphql', graphqlUploadExpress({ maxFileSize: 100000000, maxFiles: 10 }))

  // Configuring ValidationPipe to improve performance
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist: true,
      transform: true,
      // Skip transformation for Upload type (graphql-upload)
      transformOptions: {
        enableImplicitConversion: false,
      },
    })
  )

  app.useLogger(logger) // Set the logger for the app

  const configService = app.get(ConfigService)

  const nodeEnv = configService.get<string>('NODE_ENV')

  // Enable CORS for development, staging, and production with secure configuration
  if (
    nodeEnv === 'development' ||
    nodeEnv === 'staging' ||
    nodeEnv === 'production'
  ) {
    app.enableCors({
      origin: '*',
      // origin:
      //   nodeEnv === 'production' ? 'https://ng-client-rosy.vercel.app' : '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    })
  }

  // Port to listen to the application
  const port = configService.get<number>('PORT') || 3001
  await app.listen(port)

  logger.log(`Server run in: http://localhost:${port}/graphql`)
}

bootstrap()
