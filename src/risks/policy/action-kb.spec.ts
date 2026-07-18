import {
  matchKbEntry,
  resolveStepHelp,
  planKbActionMerge,
  noOfficialLinkGuidance,
  getKbSteps,
} from './action-kb';

describe('action-kb generalization', () => {
  it('matchKbEntry resolves unknown items by title/keywords', () => {
    const byTitle = matchKbEntry('password_reset', {
      type: 'unknown',
      title: '새 비밀번호로 변경',
    });
    expect(byTitle?.stepType).toBe('change_password');

    const byKeyword = matchKbEntry('password_reset', {
      type: 'unknown',
      title: '비밀번호 바꿔야 함',
    });
    expect(byKeyword?.stepType).toBe('change_password');
  });

  it('resolveStepHelp only appends current service path (no multi-brand dump)', () => {
    const entry = getKbSteps('password_reset').find((s) => s.stepType === 'change_password')!;
    const amazon = resolveStepHelp(entry, { displayName: 'Amazon', hasOfficialUrl: true });
    expect(amazon).toContain('Amazon');
    expect(amazon).toContain('로그인 및 보안');
    expect(amazon).not.toMatch(/Google:|Kakao:|Naver:/);

    // Discord는 플레이북 경로가 있으면 경로 1줄만 추가 (멀티 브랜드 나열 금지)
    const discord = resolveStepHelp(entry, { displayName: 'Discord', hasOfficialUrl: true });
    expect(discord).toContain('Discord');
    expect(discord).toContain('사용자 설정');
    expect(discord).not.toMatch(/Google:|Amazon:/);

    // 완전 미등록 서비스 + URL 없음 → 직접 접속 안내
    const ood = resolveStepHelp(entry, { displayName: 'SomeObscureBank', hasOfficialUrl: false });
    expect(ood).toContain('SomeObscureBank');
    expect(ood).toContain('직접');
    expect(ood).not.toMatch(/Google:|Amazon:/);
  });

  it('planKbActionMerge upgrades unknown rows by title', () => {
    const plan = planKbActionMerge(
      [
        {
          id: '1',
          type: 'unknown',
          title: '재설정 요청이 본인 활동인지 확인',
          description: 'desc',
          why: null,
          isRequired: true,
          externalUrl: null,
          order: 0,
          status: 'pending',
        },
        {
          id: '2',
          type: 'unknown',
          title: '새 비밀번호로 변경',
          description: null,
          why: null,
          isRequired: true,
          externalUrl: null,
          order: 1,
          status: 'pending',
        },
      ],
      'password_reset',
      {
        officialUrl: 'https://example.com',
        passwordUrl: 'https://example.com/password',
        securityUrl: 'https://example.com/security',
      },
    );

    expect(plan.updates).toHaveLength(2);
    expect(plan.updates.find((u) => u.id === '2')?.type).toBe('change_password');
    expect(plan.updates.find((u) => u.id === '2')?.externalUrl).toBe(
      'https://example.com/password',
    );
    expect(plan.updates.find((u) => u.id === '2')?.why).toBeTruthy();
    // check_recovery is optional and was not in existing → create
    expect(plan.creates.some((c) => c.type === 'check_recovery')).toBe(true);
  });

  it('noOfficialLinkGuidance is service-agnostic template', () => {
    const text = noOfficialLinkGuidance('Discord', '새 비밀번호로 변경');
    expect(text).toContain('Discord');
    expect(text).toContain('새 비밀번호로 변경');
    expect(text).toContain('메일');
  });
});
