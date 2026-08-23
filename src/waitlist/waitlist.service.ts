import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { ApproveWaitlistDto } from './dto/approve-waitlist.dto';
import { PushService } from '../push/push.service';

const TOKEN_EXPIRY_DAYS = 7;

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
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
        ageOver14Agreed: dto.ageOver14Agreed,
        privacyAgreed: dto.privacyAgreed,
        agreedAt: new Date(),
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

    // 승인 알림은 웹 푸시로 보낸다. 발송이 실패해도 승인 자체는 이미 끝났으므로
    // 되돌리지 않고 로그만 남긴다.
    await this.pushService
      .notifyWaitlistApproved(entry.id)
      .catch((e) =>
        this.logger.error(
          `[waitlist] 승인 푸시 발송 실패 (id=${entry.id}): ${
            e instanceof Error ? e.message : e
          }`,
        ),
      );

    return { ok: true, token };
  }

  private checkAdminSecret(authHeader: string | undefined) {
    const secret = this.config.get<string>('ADMIN_SECRET');
    const provided = authHeader?.replace(/^Bearer\s+/i, '');
    if (!secret || !provided || provided !== secret) {
      throw new UnauthorizedException('invalid admin secret');
    }
  }
}
