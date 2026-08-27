import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';

import { AuditModule } from '../audit/audit.module';
import { Address } from './entities/address.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Address]),
    AuditModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const avatarsDir = config.get<string>(
          'Uploads.avatarsDir',
          'uploads/avatars',
        );
        const destination = join(process.cwd(), avatarsDir);
        mkdirSync(destination, { recursive: true });

        const allowedMimeTypes = config.get<string[]>(
          'Uploads.allowedAvatarMimeTypes',
          ['image/jpeg', 'image/png', 'image/webp'],
        );

        return {
          storage: diskStorage({
            destination,
            filename: (_req, file, callback) => {
              callback(null, `${randomUUID()}${extname(file.originalname)}`);
            },
          }),
          limits: {
            fileSize: config.get<number>(
              'Uploads.maxAvatarSizeBytes',
              2 * 1024 * 1024,
            ),
          },
          fileFilter: (_req, file, callback) => {
            if (!allowedMimeTypes.includes(file.mimetype)) {
              callback(
                new BadRequestException({
                  code: 'UNSUPPORTED_FILE_TYPE',
                  message: 'Unsupported file type',
                }),
                false,
              );
              return;
            }
            callback(null, true);
          },
        };
      },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
