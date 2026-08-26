import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { IsNull, Repository } from 'typeorm';

import { SafeUser, UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import {
  generateRefreshToken,
  hashRefreshToken,
} from './utils/refresh-token.util';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    const passwordMatches = user
      ? await argon2.verify(user.password, dto.password)
      : false;

    if (!user || !passwordMatches) {
      this.logger.warn('[auth-service] - login rejected, invalid credentials.');
      // Same message and code regardless of which part is wrong — doesn't
      // reveal whether the email exists in the system.
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const { password, ...safeUser } = user;
    return this.issueTokens(safeUser);
  }

  async refresh(oldRefreshToken: string): Promise<IssuedSession> {
    const tokenHash = hashRefreshToken(oldRefreshToken);
    const existing = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid session, please log in again',
      });
    }

    if (existing.revokedAt) {
      // Reuse of an already-rotated token is the signal of a stolen
      // refresh token: kill every session for this user, not just the
      // one that presented the old token.
      await this.refreshTokenRepository.update(
        { userId: existing.userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      this.logger.warn(
        '[auth-service] - refresh token reuse detected, all sessions revoked.',
      );
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Invalid session, please log in again',
      });
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Invalid session, please log in again',
      });
    }

    // Rotation resets `createdAt` on every use, so the current row's
    // `createdAt` already means "when was this session last used" — no
    // separate lastUsedAt column needed.
    const inactivityLimitSeconds = this.configService.get<number>(
      'Auth.refreshInactivityLifetime',
      259200,
    );
    const inactiveForMs = Date.now() - existing.createdAt.getTime();
    if (inactiveForMs > inactivityLimitSeconds * 1000) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INACTIVE',
        message: 'Invalid session, please log in again',
      });
    }

    await this.refreshTokenRepository.update(existing.id, {
      revokedAt: new Date(),
    });

    const user = await this.usersService.findById(existing.userId);
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid session, please log in again',
      });
    }

    // Carries the ORIGINAL absolute expiration forward instead of letting
    // issueTokens calculate a fresh one — otherwise an active user would
    // refresh forever and the 7-day cap would never actually apply.
    return this.issueTokens(user, existing.expiresAt);
  }

  async logout(oldRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(oldRefreshToken);
    await this.refreshTokenRepository.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  // Shared by login and refresh so cookie-issuing logic never has to be
  // duplicated between the two call sites — the controller only turns the
  // result into Set-Cookie headers.
  //
  // `sessionExpiresAt` lets refresh() carry the ORIGINAL absolute
  // expiration forward instead of recalculating a fresh one on every use —
  // login (no value passed) is the only place a new 7-day window starts.
  private async issueTokens(
    user: SafeUser,
    sessionExpiresAt?: Date,
  ): Promise<IssuedSession> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });

    const refreshTokenPlaintext = generateRefreshToken();
    const refreshLifetimeSeconds = this.configService.get<number>(
      'Auth.jwtRefreshTokenLifetime',
      604800,
    );
    const expiresAt =
      sessionExpiresAt ?? new Date(Date.now() + refreshLifetimeSeconds * 1000);

    const refreshTokenEntity = this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshTokenPlaintext),
      expiresAt,
      revokedAt: null,
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    return { accessToken, refreshToken: refreshTokenPlaintext, user };
  }
}
