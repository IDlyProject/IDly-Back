# IDly Back

Gmail 보안 신호 분석 서비스 **IDly**의 NestJS 백엔드입니다.

## 아키텍처 개요

```
Browser (Front)
   │  JWT cookie / Bearer
   ▼
NestJS API  (/api/*)
   ├─ Auth      Google OAuth → User + GmailAccount
   ├─ Users     프로필 · 약관 동의 · 연결 계정
   ├─ Analysis  Gmail mbox 수집 → AI /analyze → ServiceAccount 영속화
   ├─ Home      저장된 결과 집계 (점수 · 카드 · riskSummary)
   └─ Risks     서비스 상세 · 조치 상태 · 휴면

PostgreSQL (Prisma)          AI Server (AI_SERVER_URL)
```

### 핵심 도메인

| 모델 | 역할 |
|------|------|
| `User` | IDly 회원, 약관/알림 동의 |
| `GmailAccount` | 연결된 Gmail, refreshToken(암호화), `connected` / `reconnect_required` |
| `AnalysisRun` | 비동기 분석 작업 단위 |
| `ServiceAccount` | 서비스별 위험 상태 (`action_required` / `watch` / …) |
| `RiskEvidence` | 근거 메일 메타 (`evidenceHash` 중복 방지, 본문 미저장) |
| `ActionItem` | 조치 체크리스트 |

### 분석 파이프라인

1. `POST /api/analysis/start` → `analysisId` 즉시 반환
2. 백그라운드: Gmail 수집 → AI 분석 → DB upsert
3. `GET /api/analysis/:id/status` 폴링
4. `completed` 시 `GET /api/home`으로 카드/점수 조회

- AI 전량 실패 또는 Gmail 전량 실패 → run `failed`
- 일부 계정만 실패 → `completed` + `failedReason`에 partial 기록
- 30분 이상 `queued`/`scanning` orphan → 기동/시작 시 `failed` 복구

## 로컬 실행

```bash
npm install
cp .env.example .env   # 없으면 아래 환경변수 직접 설정
npx prisma migrate dev
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/health`

## 환경변수

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth |
| `JWT_SECRET` | Access JWT 서명 (prod 필수, 로컬과 **다른** 값 권장) |
| `JWT_EXPIRES_IN` | Access JWT 수명 — 기본 **`1h`** (refresh 로테이션과 함께 사용) |
| `REFRESH_TOKEN_DAYS` | App refresh 쿠키/DB 수명 일수 — 기본 `7` |
| `REFRESH_TOKEN_SECRET` | Google refresh token AES-256-GCM 키 (base64 32바이트, prod 필수) |
| `ENABLE_SWAGGER` | `true`면 production에서도 `/docs` 노출. 기본: production 비활성 |
| `AI_SERVER_URL` | 분석 서버 base URL |
| `FRONTEND_URL` / `LANDING_URL` | CORS · OAuth 리다이렉트 |
| `NODE_ENV` | `production` 시 시크릿 강제 · Swagger 기본 오프 · Secure 쿠키 |

### 인증 쿠키

| 쿠키 | 용도 | path |
|------|------|------|
| `idly_token` | Access JWT (단기) | `/` |
| `idly_refresh` | Refresh (로테이션, DB 해시 저장) | `/api/auth` |

FE는 access 만료 시 `POST /api/auth/refresh` (`credentials: 'include'`) 로 갱신합니다.

## 스크립트

```bash
npm run build       # prisma generate + nest build
npm run start:dev
npm test            # unit tests
npx tsc --noEmit
```

## CI/CD

- **CI** (PR → `dev`/`main`): install → prisma generate → tsc → test → build
- **CD** (push → `main`): migrate deploy → Render deploy trigger → live 대기

## 보안 메모

- Google refresh token은 DB에 `enc:v1:` AES-256-GCM 으로 저장
- 이미 다른 IDly 유저에 연결된 Gmail을 “추가 연동”하면 **409 / `gmail_already_linked`** (세션 탈취 방지)
- 리소스 API는 `userId` 소유권 검증 (`analysis`, `gmail`, `service-accounts`)
- 쿠키-only mutating 요청은 Origin allowlist 검사
