import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('IDly API')
    .setDescription('IDly 백엔드 API 문서')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: '로그인 후 발급된 JWT를 입력하세요 (Bearer 제외)' },
      'access-token',
    )
    .addTag('onboarding', '화면 01·03 | Google OAuth 로그인 + 이름 입력')
    .addTag('users', '마이 화면 | 프로필 및 연결 계정 관리')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`IDly backend running on port ${port}`);
  console.log(`Swagger: http://localhost:${port}/docs`);
}
bootstrap();
