import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function toWildcardRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS: hanya izinkan origin yang terdaftar di env
  const allowedOriginPatterns = configService
    .get<string>('ALLOWED_ORIGINS', 'http://localhost:3001')
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Izinkan request tanpa origin (server-to-server, curl, Swagger)
      if (!origin) return callback(null, true);

      const normalizedOrigin = normalizeOrigin(origin);
      const isAllowed = allowedOriginPatterns.some((pattern) => {
        if (pattern === '*') return true;
        if (!pattern.includes('*')) return pattern === normalizedOrigin;
        return toWildcardRegex(pattern).test(normalizedOrigin);
      });

      if (isAllowed) return callback(null, true);

      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api/v1');

  // Global exception filter — standarisasi error response
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global response transformer — standarisasi success response
  app.useGlobalInterceptors(new TransformInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Laundry Multi-Platform API')
    .setDescription('Backend API for Laundry Management System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('APP_PORT', 3000);
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
