import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { GlobalResponseInterceptor } from '@infrastructure/config/interceptors/global-response.interceptor';

import { MainModule } from './main.module';
import { setupSwagger } from './swagger.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(MainModule, { logger: ['error', 'warn', 'log'] });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalInterceptors(new GlobalResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  setupSwagger(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') ?? 8000;

  await app.listen(port);
  console.log(`Church App backend listening on http://localhost:${port}`);
}

bootstrap();
