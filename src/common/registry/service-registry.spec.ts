import { resolveService } from './service-registry';

describe('resolveService', () => {
  it('matches service aliases from mixed evidence text', () => {
    const service = resolveService(
      'unknown account',
      'login-alert@netflix.com',
      '새 기기 로그인 알림',
    );

    expect(service.serviceName).toBe('Netflix');
    expect(service.iconUrl).toBe('https://logo.clearbit.com/netflix.com');
  });

  it('does not treat x.com alias as substring of netflix.com', () => {
    const service = resolveService('alert@netflix.com');
    expect(service.serviceName).toBe('Netflix');
  });

  it('still matches Twitter/X by domain or explicit name', () => {
    expect(resolveService('security@x.com').serviceName).toBe('Twitter');
    expect(resolveService('Twitter password reset').serviceName).toBe('Twitter');
  });

  it('falls back to the first non-empty candidate', () => {
    const service = resolveService('', undefined, 'Custom Service');

    expect(service.serviceName).toBe('Custom Service');
    expect(service.iconUrl).toBeNull();
  });
});
