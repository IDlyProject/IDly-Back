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
| Health Check | `https://idly-back.onrender.com/api/health` |
| Swagger | `https://idly-back.onrender.com/docs` |
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

- 배포 Swagger: `https://idly-back.onrender.com/docs`
- 배포 OpenAPI JSON: `https://idly-back.onrender.com/docs-json`
- 로컬: `npm run start:dev` 후 `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json` (Swagger 활성 시)

> 운영 환경에서 Swagger는 `ENABLE_SWAGGER=true`일 때 노출합니다. 제출 및 API 검수 기간에는 배포 Swagger를 활성화합니다.

**프론트 계약 원칙:** request/response 필드·예시는 FE 연동 기준으로 유지하고, Swagger description 문구만 보강합니다.

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
| `GMAIL_FETCH_BATCH_SIZE` | Gmail raw message fetch 동시 처리 크기. 메모리 보호를 위해 기본값은 보수적으로 운용 |
| `GMAIL_MAX_RAW_MESSAGE_BYTES` | mbox에 포함할 단일 raw message 최대 크기. 초과 메일은 메모리 보호를 위해 제외 |

## 성능 및 운영 정책

- 분석 API는 `analysisId`를 즉시 반환하고, 실제 Gmail 수집/AI 분석은 백그라운드로 진행합니다.
- 프론트는 `GET /api/analysis/{analysisId}/status`로 진행 상태를 polling합니다.
- 같은 사용자의 연속 분석 요청은 5분 쿨다운으로 제한해 Gmail/AI 호출 중첩을 줄입니다.
- Gmail 메일 원문은 DB에 저장하지 않고, 임시 mbox 파일로 스트리밍한 뒤 AI 분석이 끝나면 삭제합니다.
- Gmail API의 일시적 장애는 429/5xx 및 transient network error에 한해 최대 3회 exponential backoff로 재시도합니다.
- Gmail 권한 만료/취소에 해당하는 401/403은 재시도하지 않고 재연결 필요 상태로 전환합니다.
- 대용량 raw message는 `GMAIL_MAX_RAW_MESSAGE_BYTES` 기준으로 mbox에서 제외해 Render 메모리 초과 위험을 줄입니다.
- Render production 실행은 `NODE_OPTIONS=--max-old-space-size=400`으로 Node old-space 상한을 명시합니다.
- 현재 배포 구조는 단일 Render Web Service 기준입니다. 장기 확장 시 Gmail 수집/AI 분석은 queue/worker로 분리할 계획입니다.

## AI 결과 가공 정책

AI 분석 서버의 `/analyze` 응답은 백엔드 내부 스키마 검증을 거친 뒤 저장합니다. 이 과정은 프론트 request/response 계약을 바꾸지 않고, 잘못된 외부 응답이 홈/리포트 화면까지 전파되지 않도록 막기 위한 내부 방어 로직입니다.

- AI 응답의 `security_score`는 서비스별 위험 신호 강도 점수로 해석합니다. 앱 화면의 `securityScore`는 여러 서비스 계정의 `riskLevel`을 다시 집계한 0-100 전체 보안 점수이며, 두 값은 별도 개념입니다.
- AI 응답의 `security_level`(`위험`/`주의`/`양호`)과 `security_score`, 근거 메일에서 추론한 `primaryRiskType`을 함께 사용해 `riskLevel`(`high`/`medium`/`low`/`safe`)을 결정합니다.
- `new_device_login`, `password_reset`, `verification_code`, `account_recovery`는 사용자가 빠르게 확인해야 하는 보안 신호이므로, 점수가 애매해도 낮은 위험도로 묻히지 않게 보수적으로 보정합니다.
- `matched_keywords`, 제목, 날짜를 정규화해 `evidenceHash`를 만들고, 같은 서비스 계정 안에서 중복 근거가 반복 저장되지 않게 합니다.
- AI가 준 `interpretation`과 `matched_keywords`는 근거 요약에 반영하되, 조치 URL은 LLM/AI 생성값이 아니라 백엔드 service registry/action KB에서만 조립합니다.
- 알 수 없는 `security_level`은 실패시키지 않고 `security_score`와 보안 신호 유형 기반 fallback으로 처리합니다. 외부 AI contract가 일부 흔들려도 화면 응답 구조는 유지하기 위한 정책입니다.

## 핵심 시퀀스 (요약)

### 1) Google 로그인
1. `GET /api/auth/google` → Google consent
2. `GET /api/auth/google/callback` → User/GmailAccount upsert, access JWT + refresh 발급(쿠키)
3. FE는 `idly_token` / `idly_refresh`(path `/api/auth`) httpOnly 쿠키로 세션 유지
4. access 만료 시 `POST /api/auth/refresh` 로 로테이션 (재사용 시 전량 revoke)

### 2) 메일 분석
1. `POST /api/analysis/start` → `analysisId` 즉시 반환 (`queued`)
2. 백그라운드: Gmail mbox 스트리밍 수집 → AI `/analyze` → SA/Evidence/ActionItem 저장 → Solar 리포트 스냅샷
3. `GET /api/analysis/{id}/status` 폴링 → `completed` | `failed`
4. 30분 이상 `queued`/`scanning` orphan은 기동 시 `failed` 복구

### 3) 보안 조치 세션 (2-3)
1. `POST .../action-session` (bootstrap) → 메시지/공식 링크/피드백 칩
2. `POST .../messages` → 사용자의 조치 선택/완료 여부/실패 사유를 받아 다음 안내 메시지 생성
3. 완료 시 ActionItem `done`, 필요 시 SA `resolved`, report snapshot invalidate
4. 공식 URL은 **KB + service-registry만** 사용 (LLM이 URL 생성 금지)

## 보안 설계 요약

| 영역 | 정책 |
| --- | --- |
| 인증 | Google OAuth, access JWT 단기, refresh 해시 저장·로테이션·재사용 탐지 |
| 인가 | JwtGuard + DB 유저 존재 확인, SA 조회 시 `gmailAccount.userId` 소유권 |
| 메일 데이터 | 원문 DB 미저장, evidence 메타·해시만 영속 |
| LLM | secret/OTP 입력 차단, 출력 이메일·UUID 마스킹, opaque `sa_N` 컨텍스트 |
| 링크 | registry/KB official URL만, 사용자 입력/LLM URL 미신뢰 |
| 남용 | analysis/chat/beta/auth rate limit, analysis 5분 쿨다운 |
| 표면 | production Swagger 기본 비활성, Helmet, body size limit |

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
