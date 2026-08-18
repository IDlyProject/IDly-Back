import { toScreenName } from './screen-name';

describe('toScreenName', () => {
  it('정적 라우트를 한글 화면명으로 바꾼다', () => {
    expect(toScreenName('/home')).toBe('홈화면');
    expect(toScreenName('/security-assistant')).toBe('보안 도우미');
    expect(toScreenName('/my/notification-settings')).toBe('알림 설정');
  });

  it('accountId가 붙는 동적 라우트를 구분한다', () => {
    expect(toScreenName('/account/abc-123')).toBe('계정 상세');
    expect(toScreenName('/account/abc-123/action')).toBe('조치 화면');
  });

  it('쿼리스트링·해시·끝 슬래시를 무시한다', () => {
    expect(toScreenName('/home?tab=1')).toBe('홈화면');
    expect(toScreenName('/home#top')).toBe('홈화면');
    expect(toScreenName('/my/account/')).toBe('계정 관리');
  });

  it('미제공이면 (미제공)을 반환한다', () => {
    expect(toScreenName(undefined)).toBe('(미제공)');
    expect(toScreenName(null)).toBe('(미제공)');
    expect(toScreenName('')).toBe('(미제공)');
  });

  it('매핑에 없는 경로는 원본을 그대로 노출한다', () => {
    expect(toScreenName('/unknown/route')).toBe('/unknown/route');
  });
});
