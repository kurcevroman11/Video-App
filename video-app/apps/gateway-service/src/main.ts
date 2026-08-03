import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'https://406n20k8-5173.euw.devtunnels.ms',
      /^https:\/\/.*\.devtunnels\.ms$/,
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Video App API')
    .setDescription('Gateway service API for authentication and room management')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User endpoints')
    .addTag('rooms', 'Room management endpoints (proxies to room-service)')
    .addTag('turn', 'TURN credentials for WebRTC')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(3000);
  console.log('Gateway service running on http://localhost:3000');
  console.log('Swagger docs available at http://localhost:3000/api/docs');
}

bootstrap();
