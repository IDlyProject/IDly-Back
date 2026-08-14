import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { GmailPushOidcService } from './gmail-push-oidc.service';

@Injectable()
export class GmailPushOidcGuard implements CanActivate {
  constructor(private readonly oidc: GmailPushOidcService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw new UnauthorizedException('Gmail Push 인증 토큰이 없습니다.');
    }
    await this.oidc.verify(match[1]);
    return true;
  }
}
