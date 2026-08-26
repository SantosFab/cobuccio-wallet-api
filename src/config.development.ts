// Override config.ts here for development — both the Docker dev container
// (make up-dev, DATABASE_HOST=postgres) and running directly on the host
// (DATABASE_HOST=localhost, set as a shell override) use this file; it's
// the default whenever NODE_ENV isn't set to "production".
import { AppConfigUtil, DeepPartial, IAppConfig } from './config';

export default {
  Port: AppConfigUtil.getInt('PORT', 3000),
  Database: {
    host: process.env.DATABASE_HOST,
    port: AppConfigUtil.getInt('DATABASE_PORT', 5432),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  },
} satisfies DeepPartial<IAppConfig>;
