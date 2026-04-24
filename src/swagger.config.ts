import type { Request, Response } from 'express';

import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { apiReference } from '@scalar/nestjs-api-reference';

const version = '0.1.0';

export function setupSwagger(app: INestApplication): void {
  const options = new DocumentBuilder()
    .setTitle('Church App API')
    .setDescription('Multi-tenant church management — income tracking')
    .setVersion(version)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Firebase ID token',
      },
      'Bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, options);

  app.use(
    '/api-docs',
    apiReference({
      content: document,
      theme: 'purple',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      persistAuth: true,
      authentication: {
        preferredSecurityScheme: 'Bearer',
      },
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );

  app.use('/api-docs-json', (_req: Request, res: Response) => res.json(document));
}
