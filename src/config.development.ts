// Override config.ts here for development — both the Docker dev container
// (make up-dev, DATABASE_HOST=postgres) and running directly on the host
// (DATABASE_HOST=localhost, set as a shell override) use this file; it's
// the default whenever NODE_ENV isn't set to "production".
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
  Uploads: {
    avatarsDir: process.env.UPLOADS_AVATARS_DIR,
    maxAvatarSizeBytes: AppConfigUtil.getInt(
      'UPLOAD_MAX_AVATAR_SIZE_BYTES',
      2 * 1024 * 1024,
    ),
    allowedAvatarMimeTypes: process.env.UPLOAD_ALLOWED_AVATAR_MIME_TYPES?.split(
      ',',
    ),
  },
} satisfies DeepPartial<IAppConfig>;
