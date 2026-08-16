import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SolapiService } from './solapi.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { ApproveWaitlistDto } from './dto/approve-waitlist.dto';

const TOKEN_EXPIRY_DAYS = 7;

@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solapi: SolapiService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: CreateWaitlistDto) {
    const existing = await this.prisma.waitlist.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException({ errorCode: 'already_registered' });
    }

    await this.prisma.waitlist.create({
      data: {
        id: randomBytes(8).toString('hex'),
        name: dto.name,
        phone: dto.phone,
        emails: dto.emails,
      },
    });

    return { status: 'pending' };
  }

  async getStatus(phone: string) {
    if (!phone) throw new BadRequestException('phone is required');
    const entry = await this.prisma.waitlist.findUnique({ where: { phone } });
    if (!entry) return { status: 'not_found' };
    return { status: entry.status };
  }

  async verifyToken(token: string) {
    if (!token) throw new BadRequestException('token is required');
    const entry = await this.prisma.waitlist.findUnique({ where: { token } });
    if (!entry) {
      throw new NotFoundException({ errorCode: 'invalid_token' });
    }

    const expiryMs = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const isExpired =
      !entry.tokenCreatedAt ||
      Date.now() - entry.tokenCreatedAt.getTime() > expiryMs;

    if (isExpired) {
      throw new BadRequestException({ errorCode: 'expired_token' });
    }

    return { approved: true };
  }

  async approve(dto: ApproveWaitlistDto, authHeader: string | undefined) {
    this.checkAdminSecret(authHeader);

    const entry = await this.prisma.waitlist.findUnique({
      where: { phone: dto.phone },
    });
    if (!entry) throw new NotFoundException('waitlist entry not found');

    const token = randomBytes(24).toString('hex');

    await this.prisma.waitlist.update({
      where: { phone: dto.phone },
      data: { status: 'approved', token, tokenCreatedAt: new Date() },
    });

    await this.solapi.sendApprovalAlimtalk({
      name: entry.name,
      phone: entry.phone,
      token,
    });

    return { ok: true, token };
  }

  private checkAdminSecret(authHeader: string | undefined) {
    const secret = this.config.get<string>('ADMIN_SECRET');
    if (!secret) throw new Error('ADMIN_SECRET not configured');

    const provided = authHeader?.replace(/^Bearer\s+/i, '');
    if (!provided || provided !== secret) {
      throw new UnauthorizedException('invalid admin secret');
    }
  }
}
