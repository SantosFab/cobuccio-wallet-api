import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('throws at construction time if JWT_SECRET is not set', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as never;

    expect(() => new JwtStrategy(config)).toThrow(
      '[jwt-strategy] - JWT_SECRET must be set.',
    );
  });

  it('maps the JWT payload to an AuthenticatedUser', () => {
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;

    const strategy = new JwtStrategy(config);

    const result = strategy.validate({
      sub: 'user-1',
      email: 'ana@example.com',
    });

    expect(result).toEqual({ id: 'user-1', email: 'ana@example.com' });
  });
});
