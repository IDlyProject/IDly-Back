import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  @Post('analyze')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: '[AI 서버 계약] 백엔드가 AI 서버로 보내는 요청 명세',
    description: `
> **백엔드가 \`AI_SERVER_URL/analyze\`로 전송하는 요청 형식입니다.**
> AI 서버는 이 형식으로 데이터를 수신하도록 구현해주세요.

\`multipart/form-data\` 형식으로 전송:

| 필드 | 타입 | 설명 |
|------|------|------|
| \`mbox\` | File | RFC 4155 형식의 .mbox 파일 |
| \`gmailAccountId\` | string | DB의 GmailAccount UUID |
| \`email\` | string | Gmail 주소 (예: user@gmail.com) |
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
  analyze() {
    return { message: '명세 문서용 엔드포인트입니다.' };
  }
}
