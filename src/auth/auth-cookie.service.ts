import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { IssuedSession } from './auth.service';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Only this class knows how a session becomes a Set-Cookie header — the
// controller just calls it and stays focused on wiring HTTP verbs to
// AuthService calls.
@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService) {}

  setSessionCookies(response: Response, session: IssuedSession): void {
    const cookieOptions = this.getCookieOptions();
    const accessLifetimeSeconds = this.configService.get<number>(
      'Auth.jwtAccessTokenLifetime',
      900,
    );
    const refreshLifetimeSeconds = this.configService.get<number>(
      'Auth.jwtRefreshTokenLifetime',
      604800,
    );

    response.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, {
      ...cookieOptions,
      maxAge: accessLifetimeSeconds * 1000,
    });
    response.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, {
      ...cookieOptions,
      maxAge: refreshLifetimeSeconds * 1000,
    });
  }

  clearSessionCookies(response: Response): void {
    const cookieOptions = this.getCookieOptions();

    response.cookie(ACCESS_TOKEN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    response.cookie(REFRESH_TOKEN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  }

  private getCookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<boolean>('Auth.cookieSecure', false),
      sameSite: this.configService.get<'lax' | 'none' | 'strict'>(
        'Auth.cookieSameSite',
        'lax',
      ),
      path: '/',
    };
  }
}
