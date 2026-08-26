import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

// Same checksum algorithm as src/users/validators/is-cpf.validator.ts —
// generates a fresh, checksum-valid CPF per test run so repeated runs
// against the same dev database don't collide on the unique constraint.
function calculateCheckDigit(digits: string, weightStart: number): number {
  const sum = digits
    .split('')
    .reduce(
      (acc, digit, index) => acc + Number(digit) * (weightStart - index),
      0,
    );
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function generateValidCpf(): string {
  const base = Array.from({ length: 9 }, () =>
    Math.floor(Math.random() * 10),
  ).join('');
  const first = calculateCheckDigit(base, 10);
  const second = calculateCheckDigit(base + first, 11);
  return `${base}${first}${second}`;
}

function extractCookieValue(
  setCookieHeader: string[] | undefined,
  name: string,
): string {
  const raw = setCookieHeader?.find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) throw new Error(`Cookie "${name}" not found in response`);
  return raw.split(';')[0];
}

function buildSignupPayload() {
  const unique = Date.now();
  return {
    name: 'Ana Silva',
    email: `ana-${unique}@example.com`,
    cpf: generateValidCpf(),
    phone: '79996729791',
    address: {
      zipCode: '01310100',
      street: 'Avenida Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
    monthlyIncome: 5000,
    password: 'Senha123',
  };
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors the setup done in src/main.ts, which this test bypasses by
    // building AppModule directly instead of going through bootstrap().
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects a protected route with no session cookie at all', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects login with a generic message when credentials are wrong', async () => {
    const payload = buildSignupPayload();
    await request(app.getHttpServer())
      .post('/users')
      .send(payload)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: payload.email, password: 'wrong-password' })
      .expect(401);

    expect(response.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('supports signup -> login -> /auth/me -> refresh rotation, and rejects reuse of the rotated-out token', async () => {
    const payload = buildSignupPayload();
    await request(app.getHttpServer())
      .post('/users')
      .send(payload)
      .expect(201);

    const agent = request.agent(app.getHttpServer());

    const loginResponse = await agent
      .post('/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    expect(loginResponse.body).toEqual({
      id: expect.any(String),
      name: payload.name,
      email: payload.email,
    });

    const rotatedOutRefreshCookie = extractCookieValue(
      loginResponse.headers['set-cookie'] as unknown as string[],
      'refresh_token',
    );

    const meResponse = await agent.get('/auth/me').expect(200);
    expect(meResponse.body.email).toBe(payload.email);

    // The agent's own refresh (using its current, valid cookie) rotates
    // it to a brand new one.
    await agent.post('/auth/refresh').expect(200);

    // Reusing the cookie from BEFORE that rotation is the "stolen token"
    // scenario — it must be rejected, and it revokes every refresh token
    // for this user as a defensive reaction.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotatedOutRefreshCookie)
      .expect(401);

    // The agent's own (newer) refresh token got caught in that same
    // revocation, even though it was never the one reused.
    await agent.post('/auth/refresh').expect(401);

    // The still-valid access token is unaffected by refresh-token
    // revocation by design (see JwtStrategy) — it keeps working until it
    // naturally expires. Only the ability to get a NEW session is gone.
    await agent.get('/auth/me').expect(200);
  });

  it('logout revokes the refresh token so it can no longer be used to get a new session', async () => {
    const payload = buildSignupPayload();
    await request(app.getHttpServer())
      .post('/users')
      .send(payload)
      .expect(201);

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    await agent.post('/auth/logout').expect(204);

    await agent.post('/auth/refresh').expect(401);
  });
});
