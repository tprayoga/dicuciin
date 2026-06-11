import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
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

function isLocalDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const appEnv = configService.get<string>('APP_ENV', 'development');
  const isProduction = appEnv === 'production';

  // Di belakang reverse proxy (Nginx) → percayai X-Forwarded-For agar rate
  // limiter (ThrottlerGuard) memakai IP klien asli, bukan IP proxy.
  app.set('trust proxy', 1);

  // crossOriginResourcePolicy 'cross-origin' agar file (mis. foto profil) bisa
  // dimuat dari origin berbeda (Flutter Web/mobile).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(cookieParser());

  // Serve file upload statis di /uploads (foto profil, bukti bayar, banner).
  // Static middleware ini jalan sebelum enableCors → set header CORS manual agar
  // gambar (banner/promo) bisa dimuat lintas origin oleh Flutter Web/mobile.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
    },
  });

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
      if (!isProduction && isLocalDevOrigin(normalizedOrigin)) return callback(null, true);

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
