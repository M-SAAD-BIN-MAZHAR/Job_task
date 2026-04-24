import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Disable default body parser to configure raw body
  });

  const configService = app.get(ConfigService);

  // Configure body parser with raw body for webhook signature validation
  app.use(
    bodyParser.json({
      verify: (req: any, _res: any, buf: Buffer) => {
        // Store raw body for webhook signature validation
        req.rawBody = buf;
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global exception filter for consistent error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  app.enableCors();

  const port = configService.get<number>('PORT', 3000);
  const host = '0.0.0.0'; // Listen on all interfaces for Railway/Docker
  await app.listen(port, host);

  logger.log(`Application is running on: http://${host}:${port}/api/v1`);
  logger.log(`Environment: ${configService.get<string>('NODE_ENV', 'development')}`);
}

bootstrap();
