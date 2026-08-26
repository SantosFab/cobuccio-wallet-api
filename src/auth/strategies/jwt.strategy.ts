import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthenticatedUser } from '../types/authenticated-user.type';

interface AccessTokenPayload {
  sub: string;
  email: string;
}

// Validates only the access token itself — it never touches the
// refresh_tokens table. Coupling those two concerns (like checking a
// refresh token's DB row on every authenticated request) would add a
// database round-trip to every single request just to validate a JWT
// whose whole point is being self-contained; refresh rotation only needs
// to happen in POST /auth/refresh.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('Auth.jwtSecret');
    if (!secret) {
      throw new Error('[jwt-strategy] - JWT_SECRET must be set.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request): string | null =>
          (request?.cookies?.access_token as string | undefined) ?? null,
      ]),
      secretOrKey: secret,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { id: payload.sub, email: payload.email };
  }
}
