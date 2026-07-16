import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { encryptToken, resolveEncryptionKey } from '../common/crypto/token-crypto';

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
    // 이미 연결된 Gmail 계정인지 확인
    const existing = await this.prisma.gmailAccount.findUnique({
      where: { email: data.email },
      include: { user: true },
    });

    if (existing) {
      // refresh_token 갱신
      const gmailAccount = await this.prisma.gmailAccount.update({
        where: { email: data.email },
        data: { refreshToken: encryptToken(data.refreshToken, this.encryptionKey) },
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
