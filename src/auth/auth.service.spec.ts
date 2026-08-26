import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';

import { SafeUser, UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { hashRefreshToken } from './utils/refresh-token.util';

jest.mock('argon2', () => ({
  verify: jest.fn(),
}));

function buildSafeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    id: 'user-1',
    name: 'Ana Silva',
    email: 'ana@example.com',
    cpf: '52998224725',
    phone: '79996729791',
    monthlyIncome: '5000.00',
    address: undefined as never,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findByEmailWithPassword' | 'findById'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;
  let refreshTokenRepository: jest.Mocked<
    Pick<
      Repository<RefreshToken>,
      'findOne' | 'update' | 'create' | 'save'
    >
  >;

  beforeEach(async () => {
    usersService = {
      findByEmailWithPassword: jest.fn(),
      findById: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
    refreshTokenRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TypeORM's overloaded create() signature doesn't unify with jest.fn()'s inferred type.
      create: jest.fn((data) => data as RefreshToken) as any,
      save: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: new ConfigService() },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepository,
        },
      ],
    }).compile();

    service = module.get(AuthService);

    (argon2.verify as jest.Mock).mockReset();
  });

  describe('login', () => {
    it('issues tokens when the password matches', async () => {
      const user = buildSafeUser();
      usersService.findByEmailWithPassword.mockResolvedValue({
        ...user,
        password: 'hashed-password',
      } as never);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const session = await service.login({
        email: user.email,
        password: 'correct-password',
      });

      expect(argon2.verify).toHaveBeenCalledWith(
        'hashed-password',
        'correct-password',
      );
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
      });
      expect(refreshTokenRepository.save).toHaveBeenCalledTimes(1);
      expect(session.accessToken).toBe('signed-jwt');
      expect(session.user.email).toBe(user.email);
    });

    it('rejects with a generic message when the user does not exist', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.login({ email: 'missing@example.com', password: 'x' }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('rejects with the same generic message when the password is wrong', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue({
        ...buildSafeUser(),
        password: 'hashed-password',
      } as never);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'ana@example.com', password: 'wrong' }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    });
  });

  describe('refresh', () => {
    it('rejects when the token is not found', async () => {
      refreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('revokes every session for the user on reuse of an already-revoked token', async () => {
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 'refresh-1',
        userId: 'user-1',
        tokenHash: hashRefreshToken('stolen-token'),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        createdAt: new Date(),
      });

      await expect(
        service.refresh('stolen-token'),
      ).rejects.toMatchObject({ response: { code: 'REFRESH_TOKEN_REUSED' } });

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: 'user-1', revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
    });

    it('rejects when the token is expired', async () => {
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 'refresh-1',
        userId: 'user-1',
        tokenHash: hashRefreshToken('expired-token'),
        expiresAt: new Date(Date.now() - 60_000),
        revokedAt: null,
        createdAt: new Date(),
      });

      await expect(
        service.refresh('expired-token'),
      ).rejects.toMatchObject({ response: { code: 'REFRESH_TOKEN_EXPIRED' } });
    });

    it('rejects when the token has not been used for longer than the inactivity limit', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      refreshTokenRepository.findOne.mockResolvedValue({
        id: 'refresh-1',
        userId: 'user-1',
        tokenHash: hashRefreshToken('inactive-token'),
        // Far from the absolute (7-day) cap — only inactivity should reject this.
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: fourDaysAgo,
      });

      await expect(
        service.refresh('inactive-token'),
      ).rejects.toMatchObject({ response: { code: 'REFRESH_TOKEN_INACTIVE' } });
      expect(refreshTokenRepository.update).not.toHaveBeenCalled();
    });

    it('rotates the token and issues a new session when valid', async () => {
      const existing: RefreshToken = {
        id: 'refresh-1',
        userId: 'user-1',
        tokenHash: hashRefreshToken('valid-token'),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        createdAt: new Date(),
      };
      refreshTokenRepository.findOne.mockResolvedValue(existing);
      usersService.findById.mockResolvedValue(buildSafeUser());

      const session = await service.refresh('valid-token');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        existing.id,
        { revokedAt: expect.any(Date) },
      );
      // The absolute expiration carries forward unchanged on rotation —
      // issueTokens must not calculate a fresh one, or an active user
      // would refresh forever and the 7-day cap would never apply.
      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: existing.expiresAt }),
      );
      expect(refreshTokenRepository.save).toHaveBeenCalledTimes(1);
      expect(session.accessToken).toBe('signed-jwt');
    });
  });

  describe('logout', () => {
    it('revokes the refresh token matching the given plaintext', async () => {
      await service.logout('some-token');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { tokenHash: hashRefreshToken('some-token'), revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
    });
  });
});
