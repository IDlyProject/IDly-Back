import { NotificationService } from './notification.service';
import type { AlimtalkService } from './alimtalk.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('NotificationService', () => {
  let send: jest.Mock;
  let findUnique: jest.Mock;
  let findMany: jest.Mock;
  let service: NotificationService;

  const baseUser = {
    name: '김민수',
    nickname: '민수',
    phone: '01012345678',
    notificationAgreed: true,
    alertSuspiciousLogin: true,
    alertPasswordChange: true,
    alertNewDevice: true,
    alertRecoveryEmail: true,
  };

  beforeEach(() => {
    send = jest.fn().mockResolvedValue('sent');
    findUnique = jest.fn();
    findMany = jest.fn();
    service = new NotificationService(
      { user: { findUnique, findMany } } as unknown as PrismaService,
      { send } as unknown as AlimtalkService,
      { get: (_k: string, d?: string) => d ?? 'https://idly.kr' } as never,
    );
  });

  describe('분석 완료 알림', () => {
    it('전화번호와 수신 동의가 있으면 발송한다', async () => {
      findUnique.mockResolvedValue(baseUser);
      await service.sendAnalysisDone('u1');
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'analysis_done', phone: '01012345678' }),
      );
    });

    it('전화번호가 없으면 발송하지 않는다', async () => {
      findUnique.mockResolvedValue({ ...baseUser, phone: null });
      await service.sendAnalysisDone('u1');
      expect(send).not.toHaveBeenCalled();
    });

    it('수신 미동의면 발송하지 않는다', async () => {
      findUnique.mockResolvedValue({ ...baseUser, notificationAgreed: false });
      await service.sendAnalysisDone('u1');
      expect(send).not.toHaveBeenCalled();
    });

    it('닉네임이 없으면 이름으로 대체한다', async () => {
      findUnique.mockResolvedValue({ ...baseUser, nickname: null });
      await service.sendAnalysisDone('u1');
      expect(send.mock.calls[0][0].variables['#{name}']).toBe('김민수');
    });
  });

  describe('실시간 보안 알림', () => {
    const params = {
      userId: 'u1',
      serviceName: 'Netflix',
      serviceAccountId: 'sa1',
    };

    it('위험 종류에 맞는 설정이 켜져 있으면 발송한다', async () => {
      findUnique.mockResolvedValue(baseUser);
      await service.sendSecurityAlert({ ...params, riskType: 'new_device_login' });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'security_alert' }),
      );
      expect(send.mock.calls[0][0].variables['#{service}']).toBe('Netflix');
    });

    it('해당 위험 종류의 설정이 꺼져 있으면 발송하지 않는다', async () => {
      findUnique.mockResolvedValue({ ...baseUser, alertNewDevice: false });
      await service.sendSecurityAlert({ ...params, riskType: 'new_device_login' });
      expect(send).not.toHaveBeenCalled();
    });

    it('다른 종류의 설정만 꺼져 있으면 발송한다', async () => {
      findUnique.mockResolvedValue({ ...baseUser, alertPasswordChange: false });
      await service.sendSecurityAlert({ ...params, riskType: 'new_device_login' });
      expect(send).toHaveBeenCalled();
    });

    it('알림 대상이 아닌 위험 종류는 조회조차 하지 않는다', async () => {
      await service.sendSecurityAlert({
        ...params,
        riskType: 'security_recommendation',
      });
      expect(findUnique).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('계정 상세 링크를 함께 보낸다', async () => {
      findUnique.mockResolvedValue(baseUser);
      await service.sendSecurityAlert({ ...params, riskType: 'password_reset' });
      expect(send.mock.calls[0][0].variables['#{url}']).toBe(
        'https://idly.kr/account/sa1',
      );
    });
  });

  describe('주간 리포트 알림', () => {
    it('대상 유저 전원에게 발송하고 건수를 집계한다', async () => {
      findMany.mockResolvedValue([
        { id: 'u1', name: 'A', nickname: null, phone: '01011112222' },
        { id: 'u2', name: 'B', nickname: '비', phone: '01033334444' },
      ]);
      const result = await service.sendWeeklyReportReminders();
      expect(send).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ targets: 2, sent: 2 });
    });

    it('발송 실패는 집계에서 제외한다', async () => {
      findMany.mockResolvedValue([
        { id: 'u1', name: 'A', nickname: null, phone: '01011112222' },
      ]);
      send.mockResolvedValue('failed');
      const result = await service.sendWeeklyReportReminders();
      expect(result).toEqual({ targets: 1, sent: 0 });
    });

    it('온보딩 완료·수신 동의·전화번호 보유 유저만 조회한다', async () => {
      findMany.mockResolvedValue([]);
      await service.sendWeeklyReportReminders();
      expect(findMany.mock.calls[0][0].where).toEqual({
        phone: { not: null },
        notificationAgreed: true,
        onboardingCompleted: true,
      });
    });
  });
});
