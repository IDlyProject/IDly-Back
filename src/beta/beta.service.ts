import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBetaApplicantDto } from './dto/create-beta-applicant.dto';

@Injectable()
export class BetaService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(dto: CreateBetaApplicantDto) {
    const existing = await this.prisma.betaApplicant.findUnique({
      where: { email: dto.email },
    });

    if (existing) throw new ConflictException('이미 신청된 이메일입니다.');

    return this.prisma.betaApplicant.create({ data: dto });
  }
}
