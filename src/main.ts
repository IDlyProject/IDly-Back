import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = [
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
    process.env.LANDING_URL ?? 'http://localhost:5174',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('IDly API')
    .setDescription('IDly 백엔드 API 문서')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: '로그인 후 발급된 JWT를 입력하세요 (Bearer 제외)' },
      'access-token',
    )
    .addTag('onboarding', '화면 01·03·07 | Google OAuth 로그인 + 이름 입력 + 분석 트리거')
.addTag('users', '마이 화면 | 프로필 및 연결 계정 관리')
    .addTag('ai', '[AI 서버 계약] 백엔드 → AI 서버 인터페이스 명세')
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
