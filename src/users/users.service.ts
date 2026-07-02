import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromGoogle(data: {
    email: string;
    name: string;
    refreshToken: string;
    addToUserId?: string;   // 추가 계정 연결 시 기존 유저 ID
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
        data: { refreshToken: data.refreshToken },
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
          refreshToken: data.refreshToken,
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
            refreshToken: data.refreshToken,
            isPrimary: true,
          },
        },
      },
      include: { gmailAccounts: true },
    });

    return { user, gmailAccounts: user.gmailAccounts[0], gmailAccount: user.gmailAccounts[0] };
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        gmailAccounts: {
          include: { serviceAccounts: true },
        },
      },
    });
  }

  async getConnectedAccounts(userId: string) {
    return this.prisma.gmailAccount.findMany({
      where: { userId },
      include: {
        serviceAccounts: {
          select: { id: true, serviceName: true, riskStatus: true, lastAnalyzedAt: true },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async updateProfile(userId: string, dto: { name?: string; phone?: string; ageGroup?: string }) {
    return this.prisma.user.update({ where: { id: userId }, data: dto });
  }
}
