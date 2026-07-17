import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  encryptToken,
  resolveEncryptionKey,
} from '../common/crypto/token-crypto';

@Injectable()
export class UsersService {
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.encryptionKey = resolveEncryptionKey(
      config.get('REFRESH_TOKEN_SECRET'),
      config.get('NODE_ENV'),
    );
  }

  async upsertFromGoogle(data: {
    email: string;
    name: string;
    refreshToken: string;
    addToUserId?: string; // 추가 계정 연결 시 기존 유저 ID
  }) {
    const existing = await this.prisma.gmailAccount.findUnique({
      where: { email: data.email },
      include: { user: true },
    });

    if (existing) {
      // 추가 연동 모드: 이미 다른 IDly 유저에 연결된 Gmail이면 세션 혼선/탈취 방지
      if (data.addToUserId && existing.userId !== data.addToUserId) {
        throw new ConflictException({
          errorCode: 'gmail_already_linked',
          message:
            '이미 다른 IDly 계정에 연결된 Gmail입니다. 해당 계정으로 로그인하거나 연결을 해제한 뒤 다시 시도해 주세요.',
        });
      }

      // 로그인 또는 동일 유저 재연동: refresh token만 갱신
      const gmailAccount = await this.prisma.gmailAccount.update({
        where: { email: data.email },
        data: {
          refreshToken: encryptToken(data.refreshToken, this.encryptionKey),
          status: 'connected',
        },
        include: { user: true },
      });
      return { user: gmailAccount.user, gmailAccount };
    }

    // 추가 계정: 기존 유저에 Gmail 계정 추가
    if (data.addToUserId) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: data.addToUserId },
      });
      const gmailAccount = await this.prisma.gmailAccount.create({
        data: {
          userId: data.addToUserId,
          email: data.email,
          refreshToken: encryptToken(data.refreshToken, this.encryptionKey),
          isPrimary: false,
          status: 'connected',
        },
      });
      return { user, gmailAccount };
    }

    // 신규 유저 + 대표 계정 생성
    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        gmailAccounts: {
          create: {
            email: data.email,
            refreshToken: encryptToken(data.refreshToken, this.encryptionKey),
            isPrimary: true,
            status: 'connected',
          },
        },
      },
      include: { gmailAccounts: true },
    });

    return {
      user,
      gmailAccounts: user.gmailAccounts[0],
      gmailAccount: user.gmailAccounts[0],
    };
  }

  async findById(id: string) {
    return this.prisma.user
      .findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          phone: true,
          ageGroup: true,
          requiredTermsAgreed: true,
          requiredTermsAgreedAt: true,
          notificationAgreed: true,
          marketingAgreed: true,
          createdAt: true,
          gmailAccounts: {
            select: {
              id: true,
              email: true,
              isPrimary: true,
              label: true,
              status: true,
              lastSyncedAt: true,
              lastEmailReceivedAt: true,
              createdAt: true,
              serviceAccounts: {
                select: {
                  id: true,
                  serviceName: true,
                  riskLevel: true,
                  status: true,
                  lastAnalyzedAt: true,
                },
              },
            },
          },
        },
      })
      .then((user) =>
        user
          ? {
              ...user,
              gmailAccounts: user.gmailAccounts.map((account) => ({
                ...account,
                role: account.isPrimary
                  ? ('primary' as const)
                  : ('connected' as const),
              })),
            }
          : null,
      );
  }

  async getConnectedAccounts(userId: string) {
    const accounts = await this.prisma.gmailAccount.findMany({
      where: { userId },
      select: {
        id: true,
        email: true,
        isPrimary: true,
        label: true,
        status: true,
        lastSyncedAt: true,
        lastEmailReceivedAt: true,
        createdAt: true,
        serviceAccounts: {
          select: {
            id: true,
            serviceName: true,
            riskLevel: true,
            status: true,
            lastAnalyzedAt: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return accounts.map((account) => ({
      ...account,
      role: account.isPrimary ? ('primary' as const) : ('connected' as const),
    }));
  }

  async updateProfile(
    userId: string,
    dto: { name?: string; phone?: string; ageGroup?: string },
  ) {
    return this.prisma.user.update({ where: { id: userId }, data: dto });
  }

  async getDormantAccounts(userId: string) {
    const accounts = await this.prisma.serviceAccount.findMany({
      where: { status: 'dormant', gmailAccount: { userId } },
      select: {
        id: true,
        serviceName: true,
        displayName: true,
        iconUrl: true,
        iconLabel: true,
        dormantAt: true,
        gmailAccount: { select: { email: true } },
      },
      orderBy: { dormantAt: 'desc' },
    });

    return accounts.map((sa) => ({
      id: sa.id,
      serviceName: sa.serviceName,
      displayName: sa.displayName,
      iconUrl: sa.iconUrl,
      iconLabel: sa.iconLabel,
      email: sa.gmailAccount.email,
      dormantAt: sa.dormantAt?.toISOString() ?? null,
      dormantDuration: sa.dormantAt
        ? formatDormantDuration(sa.dormantAt)
        : null,
    }));
  }

  async restoreAllDormant(userId: string) {
    const accounts = await this.prisma.serviceAccount.findMany({
      where: { status: 'dormant', gmailAccount: { userId } },
      select: { id: true, previousStatus: true },
    });

    await this.prisma.$transaction(
      accounts.map((sa) =>
        this.prisma.serviceAccount.update({
          where: { id: sa.id },
          data: {
            status: sa.previousStatus ?? 'safe',
            dormantAt: null,
            previousStatus: null,
          },
        }),
      ),
    );

    return { restoredCount: accounts.length };
  }

  async getNotificationSettings(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        alertSuspiciousLogin: true,
        alertPasswordChange: true,
        alertNewDevice: true,
        alertRecoveryEmail: true,
        alertSecurityTip: true,
        alertEventPromo: true,
      },
    });
  }

  async updateNotificationSettings(
    userId: string,
    dto: {
      alertSuspiciousLogin?: boolean;
      alertPasswordChange?: boolean;
      alertNewDevice?: boolean;
      alertRecoveryEmail?: boolean;
      alertSecurityTip?: boolean;
      alertEventPromo?: boolean;
    },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        alertSuspiciousLogin: true,
        alertPasswordChange: true,
        alertNewDevice: true,
        alertRecoveryEmail: true,
        alertSecurityTip: true,
        alertEventPromo: true,
      },
    });
  }

  async saveConsent(
    userId: string,
    dto: {
      requiredTermsAgreed: true;
      notificationAgreed?: boolean;
      marketingAgreed?: boolean;
    },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { requiredTermsAgreedAt: true },
    });

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        requiredTermsAgreed: true,
        requiredTermsAgreedAt: user.requiredTermsAgreedAt ?? new Date(),
        ...(dto.notificationAgreed !== undefined
          ? { notificationAgreed: dto.notificationAgreed }
          : {}),
        ...(dto.marketingAgreed !== undefined
          ? { marketingAgreed: dto.marketingAgreed }
          : {}),
      },
      select: {
        id: true,
        requiredTermsAgreed: true,
        requiredTermsAgreedAt: true,
        notificationAgreed: true,
        marketingAgreed: true,
      },
    });
  }
}

function formatDormantDuration(dormantAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - dormantAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 30) return `${diffDays}일`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `${months}개월`;
  const years = Math.floor(months / 12);
  return `${years}년`;
}
