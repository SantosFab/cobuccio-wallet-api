import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { mkdirSync } from 'fs';
import { join } from 'path';

import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { AvatarStorageService } from './avatar-storage.service';
import { Address } from './entities/address.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Address]),
    AuditModule,
    MailModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const avatarsDir = config.get<string>(
          'Uploads.avatarsDir',
          'uploads/avatars',
        );
        // Only needed so AvatarStorageService.save has somewhere to write
        // an already-validated file to — Multer itself never touches disk
        // (see `storage` below).
        mkdirSync(join(process.cwd(), avatarsDir), { recursive: true });

        const allowedMimeTypes = config.get<string[]>(
          'Uploads.allowedAvatarMimeTypes',
          ['image/jpeg', 'image/png', 'image/webp'],
        );

        return {
          // Buffers the upload in memory instead of writing it to disk.
          // AvatarStorageService.save checks the real file content (see
          // image-signature.util.ts) against `file.buffer` and only
          // writes it to disk once that check passes — an invalid or
          // malicious upload never touches the filesystem, not even
          // briefly.
          storage: memoryStorage(),
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
  providers: [UsersService, AvatarStorageService],
  exports: [UsersService],
})
export class UsersModule {}
