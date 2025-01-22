import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('App');

async function bootstrap() {
  Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']);

  const app = await NestFactory.create(AppModule);

  // Configuring ValidationPipe to improve performance
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist: true,
      transform: true,
    }),
  );

  app.useLogger(logger); // Set the logger for the app

  const configService = app.get(ConfigService);

  const nodeEnv = configService.get<string>('NODE_ENV');

  // Enable CORS for development, staging, and production with secure configuration
  if (
    nodeEnv === 'development' ||
    nodeEnv === 'staging' ||
    nodeEnv === 'production'
  ) {
    app.enableCors({
      origin:
        nodeEnv === 'production' ? 'https://ng-client-rosy.vercel.app' : '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    });
  }

  // Port to listen to the application
  const port = configService.get<number>('PORT') || 3001;
  await app.listen(port);

  logger.log(`Server run in: http://localhost:${port}/graphql`);
}

bootstrap();
