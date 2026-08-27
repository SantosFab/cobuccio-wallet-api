import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser());

  const config = app.get(ConfigService);

  // Serves whatever config.Uploads.avatarsDir resolves to (default
  // "uploads/avatars") under the "/uploads/" prefix, so an avatarUrl like
  // "/uploads/avatars/<file>" saved by UsersService.updateAvatar resolves
  // to the actual file on disk.
  const avatarsDir = config.get<string>('Uploads.avatarsDir', 'uploads/avatars');
  app.useStaticAssets(join(process.cwd(), avatarsDir, '..'), {
    prefix: '/uploads/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({
    origin: config.get<string>('CorsOrigin', 'http://localhost:3000'),
    credentials: true,
  });

  await app.listen(config.get<number>('Port', 3000));
}
void bootstrap();
