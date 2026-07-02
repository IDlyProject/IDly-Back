import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AiAnalyzeResponseDto } from './ai.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  @Post('analyze')
  @HttpCode(200)
  @ApiOperation({
    summary: '[AI 서버 계약] POST /analyze — mbox 수신 + 분석 결과 반환',
    description: `
> **이 엔드포인트는 AI 서버가 구현해야 할 인터페이스 명세입니다.**
> 실제 호출은 \`AI_SERVER_URL/analyze\`로 전송됩니다.

---

### 백엔드 → AI 서버 (Request)

\`multipart/form-data\` 형식으로 전송:

| 필드 | 타입 | 설명 |
|------|------|------|
| \`mbox\` | File | RFC 4155 형식의 .mbox 파일 |
| \`gmailAccountId\` | string | DB의 GmailAccount UUID |
| \`email\` | string | Gmail 주소 (예: user@gmail.com) |

---

### AI 서버 → 백엔드 (Response)

분석된 서비스별 위험 정보를 아래 형식으로 반환:

\`\`\`json
{
  "services": [
    {
      "name": "Disney+",
      "riskStatus": "danger",
      "riskType": "new_device_login",
      "severity": "high",
      "signals": [
        {
          "messageId": "abc123",
          "subject": "[Disney+] New device signed in",
          "from": "noreply@disney.com",
          "date": "2024-01-15T09:30:00Z",
          "snippet": "A new device signed in to your account..."
        }
      ],
      "actions": [
        { "label": "비밀번호 변경", "isRequired": true },
        { "label": "연결 기기 확인", "isRequired": false }
      ]
    }
  ]
}
\`\`\`

### riskStatus 값
| 값 | 의미 |
|----|------|
| \`safe\` | 위험 없음 |
| \`warning\` | 주의 필요 |
| \`danger\` | 즉각 조치 필요 |

### riskType 예시
\`new_device_login\`, \`password_changed\`, \`suspicious_activity\`, \`account_locked\`
    `.trim(),
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mbox', 'gmailAccountId', 'email'],
      properties: {
        mbox: { type: 'string', format: 'binary', description: 'RFC 4155 .mbox 파일' },
        gmailAccountId: { type: 'string', description: 'GmailAccount UUID' },
        email: { type: 'string', description: 'Gmail 주소' },
      },
    },
  })
  @ApiResponse({ status: 200, type: AiAnalyzeResponseDto })
  analyze() {
    return { message: '이 엔드포인트는 명세 문서용입니다. 실제 호출은 AI_SERVER_URL로 전송됩니다.' };
  }
}
