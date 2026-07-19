# IDly Back

Gmail 보안 신호 분석 서비스 **IDly**의 백엔드 API 서버입니다. 사용자가 연결한 Gmail 메일함에서 보안 관련 신호를 분석하고, 서비스 계정별 위험도/근거/조치 가이드/보안 도우미 챗봇 API를 제공합니다.

## 제출 산출물

| 항목 | 내용 |
| --- | --- |
| 개발 환경 정보 | [개발 환경](#개발-환경) |
| 개발 스택 정보 | [개발 스택](#개발-스택) |
| ERD | [docs/erd.md](./docs/erd.md) |
| API 명세 | [배포 Swagger](https://idly-back.onrender.com/docs) |

## 배포 정보

| 항목 | 값 |
| --- | --- |
| API Base URL | `https://idly-back.onrender.com/api` |
| Swagger | `https://idly-back.onrender.com/docs` |
| Health Check | `https://idly-back.onrender.com/api/health` |
| 배포 플랫폼 | Render Web Service |
| 배포 브랜치 | `main` |

## 개발 환경

| 항목 | 버전/설정 |
| --- | --- |
| Runtime | Node.js `v24.9.0` |
| Package Manager | npm `11.6.0` |
| Framework | NestJS 11 |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| API 문서 | Swagger / OpenAPI |
| 테스트 | Jest |
| 배포 | Render |

## 개발 스택

### Backend

- NestJS
- TypeScript
- Prisma Client
- PostgreSQL
- Swagger OpenAPI
- Jest

### Authentication & Security

- Google OAuth 2.0
- JWT access token
- HttpOnly refresh cookie
- App refresh token rotation
- Google OAuth refresh token AES-256-GCM encryption
- CORS allowlist
- Origin validation for cookie-only mutating requests
- Per-user rate limiting for LLM chat
- Sensitive text filtering before LLM calls

### External Services

- Gmail API: connected mailbox collection
- AI analysis server: mbox security analysis
- Upstage Solar API: security report/chat response generation
- Render: production deployment

## 주요 기능

### 1. 인증/회원

- Google OAuth 로그인
- 대표 Gmail 계정 및 추가 Gmail 계정 연결
- JWT access token + refresh token rotation
- 약관 동의, 프로필, 알림 설정, 계정 관리, 탈퇴 API

### 2. Gmail 분석 파이프라인

1. `POST /api/analysis/start`로 분석 작업 생성
2. 백그라운드에서 Gmail API로 mbox 수집
3. AI 분석 서버로 mbox 전송
4. 분석 결과를 `ServiceAccount`, `RiskEvidence`, `ActionItem`으로 저장
5. `GET /api/analysis/{analysisId}/status`로 상태 폴링
6. 완료 후 홈/리포트/상세 화면에서 저장된 결과 조회

### 3. 홈/리포트/정리 화면

- Gmail 계정별 서비스 계정 목록
- 보안 점수 및 위험 요약
- 위험 서비스 카드
- 전체 보안 리포트
- 월별 보안 정리

### 4. 계정 상세 및 보안 조치

- 서비스 계정별 위험 근거 이메일 요약
- 필수/선택 조치 항목
- 공식 보안 설정 링크
- 조치 완료/실패/재시도 상태 관리
- 휴면/건너뛰기/복원 처리

### 5. 보안 도우미

- 2-3 계정 상세 화면의 action assistant
- 2-4 전체 보안 도우미 챗봇
- LLM 기반 응답 + 백엔드 KB/서비스 레지스트리 기반 공식 링크 조립
- `text`, `action_list`, `official_link`, `card_news`, `exit_cta` rich message 지원
- 비밀번호/인증코드/카드번호 입력 차단

## 아키텍처 개요

```text
Client
  |
  | HTTPS / JWT cookie or Bearer token
  v
NestJS API
  |-- Auth / Users
  |-- Gmail
  |-- Analysis
  |-- Home / Report / Summary
  |-- Service Account Detail
  |-- Action Assistant
  |-- Security Chat
  |
  +--> PostgreSQL (Prisma)
  +--> Gmail API
  +--> AI Analysis Server
  +--> Upstage Solar API
```

## ERD

전체 ERD는 [docs/erd.md](./docs/erd.md)에 정리되어 있습니다.

포함 모델:

- `User`
- `AuthRefreshToken`
- `WithdrawalLog`
- `GmailAccount`
- `AnalysisRun`
- `ServiceAccount`
- `RiskEvidence`
- `ActionItem`
- `ActionSession`
- `ActionMessage`
- `ActionAttempt`
- `SecurityChat`
- `SecurityChatMessage`
- `BetaApplicant`
- `UserResponseLog`

## API 명세

API 명세는 배포 Swagger에서 확인합니다.

- Swagger: `https://idly-back.onrender.com/docs`
- OpenAPI JSON: `https://idly-back.onrender.com/docs-json`

주요 태그:

- `1-1. 로그인`
- `1-2. 회원가입`
- `2-1. 홈 화면`
- `2-3. 계정 상세 · 보안 조치`
- `2-4. 보안 도우미`
- `2-4. 전체 보안 리포트`
- `3-1. 정리 화면`
- `4-1. 마이 화면`
- `4-2. 계정 관리`
- `4-3. 탈퇴`
- `랜딩 | 베타 신청`

## 로컬 실행

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

로컬 기본 URL:

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/health`

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 애플리케이션 연결 URL |
| `DIRECT_URL` | Prisma migration용 direct DB URL |
| `NODE_ENV` | 실행 환경 |
| `FRONTEND_URL` | 프론트엔드 origin |
| `LANDING_URL` | 랜딩 페이지 origin |
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URI |
| `JWT_SECRET` | JWT 서명 secret |
| `JWT_EXPIRES_IN` | access token 만료 시간 |
| `REFRESH_TOKEN_DAYS` | app refresh token 만료 일수 |
| `REFRESH_TOKEN_SECRET` | Gmail OAuth refresh token 암호화 키 |
| `AI_SERVER_URL` | AI 분석 서버 base URL |
| `SOLAR_API_KEY` | Upstage Solar API key |
| `ENABLE_SWAGGER` | production Swagger 노출 여부 |

## NPM Scripts

| 명령어 | 설명 |
| --- | --- |
| `npm run build` | Prisma generate 후 NestJS build |
| `npm run start` | NestJS 서버 실행 |
| `npm run start:dev` | watch mode 개발 서버 실행 |
| `npm run start:prod` | build 결과 실행 |
| `npm test` | Jest 테스트 실행 |
| `npm run test:e2e` | e2e 테스트 실행 |
| `npm run lint` | ESLint 실행 |

## 보안 원칙

- 메일 원문은 영속 저장하지 않고 분석 결과/근거 요약만 저장합니다.
- Google OAuth refresh token은 암호화하여 저장합니다.
- 앱 refresh token은 원문 저장 없이 hash로 저장하고 rotation/revoke를 지원합니다.
- 서비스 계정/분석/채팅 조회는 user ownership을 검증합니다.
- 보안 도우미 LLM 호출 전 민감정보 패턴을 차단합니다.
- 공식 링크는 LLM 생성 URL이 아니라 백엔드 service registry/action KB에서만 조립합니다.

## CI/CD

- PR 및 main 배포 전 GitHub Actions에서 type check/build/test를 수행합니다.
- Render는 `main` 브랜치 기준으로 배포합니다.
- 배포 시 Prisma migration을 적용한 뒤 production server를 실행합니다.
