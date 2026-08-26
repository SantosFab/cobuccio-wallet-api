import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfig, deepMergeConfig, DeepPartial, IAppConfig } from './config';
import { UsersModule } from './users/users.module';

// The environment name is only known at runtime, so this can't be a
// static `import` — it has to be a dynamic `require`.
function loadEnvironmentConfig(): DeepPartial<IAppConfig> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const environmentConfig = require(
    `./config.${process.env.NODE_ENV || 'development'}`,
  ) as {
    default: DeepPartial<IAppConfig>;
  };

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
