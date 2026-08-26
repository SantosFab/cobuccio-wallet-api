// Override config.ts here for the deployed production environment only.
import { AppConfigUtil, DeepPartial, IAppConfig } from './config';

export default {
  Port: AppConfigUtil.getInt('PORT', 3000),
  CorsOrigin: process.env.CORS_ORIGIN,
  Database: {
    host: process.env.DATABASE_HOST,
    port: AppConfigUtil.getInt('DATABASE_PORT', 5432),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    // Most managed Postgres providers require SSL; opt in via env instead
    // of assuming a specific host, since production infra isn't set up yet.
    ...(process.env.DATABASE_SSL === 'true'
      ? { ssl: { rejectUnauthorized: true } }
      : {}),
  },
  Auth: {
    jwtSecret: process.env.JWT_SECRET,
    // Lifetimes are a security/product decision, not something that
    // varies by deploy environment — left as plain constants in
    // config.ts's AppConfig.Auth instead of env vars.
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as
      'lax' | 'none' | 'strict',
  },
} satisfies DeepPartial<IAppConfig>;
