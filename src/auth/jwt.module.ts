import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtGuard } from './jwt.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: (() => {
          const secret = config.get<string>('JWT_SECRET');
          if (!secret && config.get('NODE_ENV') === 'production') {
            throw new Error('JWT_SECRET is required in production');
          }
          return secret ?? 'idly-local-dev-secret';
        })(),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  providers: [JwtGuard],
  exports: [JwtModule, JwtGuard],
})
export class JwtAuthModule {}
