import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = [
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
    process.env.LANDING_URL ?? 'http://localhost:5174',
    'https://i-dly-landing.vercel.app',
    'https://i-dly-front.vercel.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser clients (curl, server-to-server) often omit Origin
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Do not throw — Nest would turn Error into 500; deny origin instead
        callback(null, false);
      }
    },
    credentials: true,
  });

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('IDly API')
    .setDescription('IDly 백엔드 API 문서')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '로그인 후 발급된 JWT를 입력하세요 (Bearer 제외)',
      },
      'access-token',
    )
    .addTag('1-1. 로그인', 'Google OAuth 로그인 시작 및 콜백 처리')
    .addTag(
      '1-2. 회원가입',
      '온보딩 — 대표 계정 설정 · 약관 동의 · 추가 계정 연동 · 분석 시작',
    )
    .addTag('2-1. 홈 화면', '홈 데이터 조회 · 분석 상태 확인 · 홈 카드 숨김')
    .addTag(
      '2-3. 계정 상세 · 보안 조치',
      '서비스 계정 상세 조회 · 조치 상태 저장',
    )
    .addTag('2-4. 보안 도우미', '보안 조치 보조 챗봇 · 공식 링크 안내')
    .addTag('2-4. 전체 보안 리포트', '보안 점수 · Solar 가공 리포트 · 서비스별 위험 이벤트')
    .addTag('3-1. 정리 화면', '월별 보안 정리 — 이번 달 위험 서비스 목록')
    .addTag('4-1. 마이 화면', '내 프로필 조회')
    .addTag('4-2. 계정 관리', '연결된 Gmail 계정 목록 조회')
    .addTag('4-3. 탈퇴', '회원 탈퇴')
    .addTag('랜딩 | 베타 신청', '랜딩 페이지 — 베타 신청자 등록')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // CLI 플러그인이 class-level @ApiTags를 메서드에 중복 적용하는 경우 dedup
  const allowedTags = new Set([
    '1-1. 로그인',
    '1-2. 회원가입',
    '2-1. 홈 화면',
    '2-3. 계정 상세 · 보안 조치',
    '2-4. 보안 도우미',
    '2-4. 전체 보안 리포트',
    '3-1. 정리 화면',
    '4-1. 마이 화면',
    '4-2. 계정 관리',
    '4-3. 탈퇴',
    '랜딩 | 베타 신청',
  ]);
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const op of Object.values(pathItem as Record<string, any>)) {
      if (op && Array.isArray(op.tags)) {
        op.tags = [...new Set(op.tags as string[])].filter((t) =>
          allowedTags.has(t),
        );
      }
    }
  }

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      displayRequestDuration: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`IDly backend running on port ${port}`);
  console.log(`Swagger: http://localhost:${port}/docs`);
  console.log(`Health:  http://localhost:${port}/api/health`);
}
bootstrap();
