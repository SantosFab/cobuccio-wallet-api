import { config as loadEnv } from 'dotenv';
import { expand as expandEnv } from 'dotenv-expand';
import { DataSource } from 'typeorm';

// The .env file uses shell-style interpolation (DATABASE_HOST=${PGHOST}),
// so a plain dotenv.config() would leave DATABASE_HOST as the literal
// string "${PGHOST}" — dotenv-expand resolves those references first.
// This CLI entrypoint runs outside Nest's bootstrap (used only by the
// typeorm CLI for migrations), so it has to load the .env manually;
// the app itself reads it through @nestjs/config's ConfigModule instead.
expandEnv(loadEnv());

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
