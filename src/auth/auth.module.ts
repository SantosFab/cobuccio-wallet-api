import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AuthCookieService } from './auth-cookie.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    AuditModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('Auth.jwtSecret');
        if (!secret) {
          throw new Error('[auth-module] - JWT_SECRET must be set.');
        }

        return {
          secret,
          signOptions: {
            expiresIn: config.get<number>('Auth.jwtAccessTokenLifetime', 900),
          },
        };
      },
    }),
    // Only used on POST /auth/login (see auth.controller.ts) — registered
    // here, not as a global APP_GUARD, so it doesn't affect every other
    // route without reason.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookieService,
    JwtStrategy,
    // Global guard: every route requires a valid access token by default,
    // opted out explicitly with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
