# 온보딩 플로우 — 프론트엔드 스펙

## 화면 구성

**A. 사전 등록 화면** (미등록 유저)
- 이름, 전화번호, Gmail 주소 입력 (최대 5개)
- 약관 동의 3개 (만 14세 이상, 개인정보, 알림톡)
- [등록하기] 버튼
- "이미 계정 등록을 마치셨나요? 분석하러 가기" 링크 → C 화면

**B. 대기 화면** (등록 완료, 미승인)
- 등록 완료 안내, 카카오톡으로 순서대로 안내 예정 메시지

**C. 입장 가능 화면** (승인된 유저)
- "계정 등록이 완료되셨나요? 아래 버튼을 눌러 대표 Gmail부터 연결해주세요."
- [Gmail로 시작하기] → 기존 OAuth 플로우

---

## 진입 분기 로직

```
앱 진입
├─ URL ?token=xxx 있음
│    ├─ GET /waitlist/verify?token=xxx → 200 OK
│    │    → localStorage.setItem('waitlist_approved', 'true') 저장
│    │    → C 화면
│    └─ 실패(만료/무효) → A 화면
├─ localStorage.getItem('waitlist_approved') === 'true' → C 화면
├─ localStorage.getItem('waitlist_phone') 있음
│    → GET /waitlist/status?phone=xxx
│    ├─ approved → localStorage.setItem('waitlist_approved', 'true') → C 화면
│    ├─ pending → B 화면
│    └─ not_found → A 화면
└─ 아무것도 없음 → A 화면
```

---

## localStorage 키

| 키 | 저장 시점 | 값 |
|---|---|---|
| `waitlist_phone` | A 화면 등록 성공 시 | 전화번호 문자열 |
| `waitlist_approved` | 토큰 검증 성공 또는 status=approved 시 | `'true'` |

---

## API

### POST /waitlist — 사전 등록

```json
// Request
{
  "name": "홍길동",
  "phone": "01012341234",
  "emails": ["abc@gmail.com", "def@gmail.com"]
}

// Response 201
{ "status": "pending" }

// Response 409 — 이미 등록된 번호
{ "errorCode": "already_registered" }
```

### GET /waitlist/status?phone=01012341234 — 상태 조회

```json
// Response 200
{ "status": "pending" | "approved" | "not_found" }
```

### GET /waitlist/verify?token=xxxxx — 알림톡 토큰 검증

```json
// Response 200
{ "approved": true }

// Response 400/404
{ "errorCode": "invalid_token" | "expired_token" }
```

---

## 에러 처리

| 상황 | 처리 |
|---|---|
| 이미 등록된 전화번호 | "이미 등록된 번호입니다. 카카오톡 안내를 기다려주세요." |
| 토큰 만료/무효 | A 화면으로 이동 |
| status API 실패 | B 화면 유지 (재시도 안내) |

---

## 기존 OAuth 플로우 연결

C 화면에서 [Gmail로 시작하기] 클릭 시 기존 `GET /auth/google` 로 이동. 이후 플로우 동일.

OAuth 완료 후 `waitlist_approved`, `waitlist_phone` localStorage 키 삭제.
