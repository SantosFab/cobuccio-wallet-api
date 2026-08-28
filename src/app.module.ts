import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AppConfig, deepMergeConfig, DeepPartial, IAppConfig } from './config';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';

// The environment name is only known at runtime, so this can't be a
// static `import` — it has to be a dynamic `require`.
function loadEnvironmentConfig(): DeepPartial<IAppConfig> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const environmentConfig = require(
    `./config.${process.env.NODE_ENV || 'development'}`,
  ) as {
    default: DeepPartial<IAppConfig>;
  };

  // Fail fast instead of falling back to a hardcoded secret — this runs
  // before any other module (TypeORM, Auth) is instantiated.
  if (!process.env.JWT_SECRET) {
    throw new Error(
      '[app-module] - JWT_SECRET must be set; refusing to start without it.',
    );
  }

  return environmentConfig.default;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      // A single factory handing Nest the already-merged config, instead
      // of two factories it would merge itself — @nestjs/config's own
      // `load` merge is shallow (Object.assign) and would silently drop
      // base fields that config.<env>.ts doesn't repeat.
      load: [() => deepMergeConfig(AppConfig, loadEnvironmentConfig())],
    }),
    // Baseline abuse protection on every route (opt out per-route with
    // @SkipThrottle() if ever needed) — POST /auth/login overrides this
    // with a stricter limit of its own (see auth.controller.ts).
    ThrottlerModule.forRoot([{ ttl: 30000, limit: 40 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...config.get<Record<string, unknown>>('Database'),
        // Glob instead of listing each entity class by hand — resolves
        // against __dirname, so it finds `*.entity.ts` under `ts-node`
        // (dev) and `*.entity.js` once compiled to dist/ (prod) without
        // needing two different patterns.
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
      }),
    }),
    UsersModule,
    AuthModule,
    WalletsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
