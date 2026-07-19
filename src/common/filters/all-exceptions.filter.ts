import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorBody: Record<string, unknown> = {};

    if (err instanceof HttpException) {
      status = err.getStatus();
      const body = err.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? message;
        errorBody = b;
      }
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = '리소스를 찾을 수 없습니다.';
        errorBody = { error: 'Not Found' };
      }
    }

    const label = `${req.method} ${req.url} → ${status}`;

    if (status >= 500) {
      this.logger.error(
        `${label} | ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(`${label} | ${Array.isArray(message) ? message.join(', ') : message}`);
    }

    res.status(status).json({
      statusCode: status,
      message,
      ...errorBody,
    });
  }
}
