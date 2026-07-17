import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface ReportSnapshotInput {
  services: {
    serviceAccountId: string;
    serviceName: string;
    riskLevel: string;
    primaryRiskType: string | null;
    interpretation: string | null;
    evidenceSubjects: string[];
  }[];
  securityScore: number;
}

export interface ReportSnapshot {
  scoreDescription: string;
  recommendations: {
    serviceAccountId: string;
    headline: string;
    reason: string;
  }[];
  riskEvents: {
    evidenceId: string;
    title: string;
    description: string;
  }[];
}

@Injectable()
export class SolarService {
  private readonly logger = new Logger(SolarService.name);
  private readonly SOLAR_URL = 'https://api.upstage.ai/v1/chat/completions';

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  async generateReportSnapshot(
    input: ReportSnapshotInput,
    evidences: { id: string; serviceAccountId: string; subject: string | null; summary: string | null; riskType: string }[],
  ): Promise<ReportSnapshot | null> {
    const apiKey = this.config.get<string>('SOLAR_API_KEY');
    if (!apiKey) {
      this.logger.warn('SOLAR_API_KEY 미설정 — reportSnapshot 생성 스킵');
      return null;
    }

    const prompt = this.buildPrompt(input, evidences);

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          this.SOLAR_URL,
          {
            model: 'solar-pro',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.3,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 30_000,
          },
        ),
      );

      const content = data.choices?.[0]?.message?.content;
      if (!content) return null;
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const raw = JSON.parse(cleaned) as ReportSnapshot;
      return this.validate(raw, input, evidences);
    } catch (err) {
      this.logger.error('Solar 리포트 생성 실패', (err as Error).message);
      return null;
    }
  }

  private buildPrompt(
    input: ReportSnapshotInput,
    evidences: { id: string; serviceAccountId: string; subject: string | null; summary: string | null; riskType: string }[],
  ): string {
    const riskLabel = (level: string) =>
      ({ high: '위험', medium: '주의', low: '낮음', safe: '안전' })[level] ?? level;

    const serviceList = input.services
      .filter((s) => s.riskLevel !== 'safe')
      .map(
        (s) =>
          `- serviceAccountId: ${s.serviceAccountId}\n  서비스: ${s.serviceName}\n  위험도: ${riskLabel(s.riskLevel)}\n  해석: ${s.interpretation ?? '없음'}`,
      )
      .join('\n');

    const evidenceList = evidences
      .slice(0, 10)
      .map(
        (e) =>
          `- evidenceId: ${e.id}\n  serviceAccountId: ${e.serviceAccountId}\n  제목: ${e.subject ?? '없음'}\n  요약: ${e.summary ?? '없음'}`,
      )
      .join('\n');

    return `당신은 IDly 보안 앱의 한국어 리포트 작성 AI입니다. 말투는 간결하고 친근한 존댓말로 작성하세요.

아래 분석 결과를 바탕으로 JSON을 생성하세요.

[서비스 분석 결과]
${serviceList || '없음'}

[위험 근거 이메일]
${evidenceList || '없음'}

다음 JSON 형식으로만 응답하세요:
{
  "scoreDescription": "보안 점수 ${input.securityScore}점에 맞는 한 문장 설명 (예: '일부 계정에 즉각적인 조치가 필요해요')",
  "recommendations": [
    {
      "serviceAccountId": "<위 서비스 중 하나의 serviceAccountId>",
      "headline": "서비스명 + 핵심 조치 (10자 이내, 예: 'Twitter 비밀번호 즉시 변경')",
      "reason": "구체적인 이유 한 문장 (예: '의심스러운 로그인 시도가 감지되었어요')"
    }
  ],
  "riskEvents": [
    {
      "evidenceId": "<위 evidenceId 중 하나>",
      "title": "이벤트 유형 한국어 레이블 (예: '비밀번호 유출 감지')",
      "description": "구체적인 설명 한 문장"
    }
  ]
}

주의: serviceAccountId와 evidenceId는 위에서 제공된 값만 사용하세요.`;
  }

  private validate(
    raw: any,
    input: ReportSnapshotInput,
    evidences: { id: string }[],
  ): ReportSnapshot | null {
    const validSaIds = new Set(input.services.map((s) => s.serviceAccountId));
    const validEvidenceIds = new Set(evidences.map((e) => e.id));

    const scoreDescription = typeof raw.scoreDescription === 'string' ? raw.scoreDescription.trim() : '';
    if (!scoreDescription) return null;

    const seenSaIds = new Set<string>();
    const recommendations = (raw.recommendations ?? [])
      .filter((r: any) => validSaIds.has(r.serviceAccountId) && !seenSaIds.has(r.serviceAccountId))
      .map((r: any) => {
        seenSaIds.add(r.serviceAccountId);
        return { serviceAccountId: r.serviceAccountId, headline: r.headline ?? '', reason: r.reason ?? '' };
      });

    const riskEvents = (raw.riskEvents ?? [])
      .filter((e: any) => validEvidenceIds.has(e.evidenceId))
      .map((e: any) => ({ evidenceId: e.evidenceId, title: e.title ?? '', description: e.description ?? '' }));

    return { scoreDescription, recommendations, riskEvents };
  }
}
