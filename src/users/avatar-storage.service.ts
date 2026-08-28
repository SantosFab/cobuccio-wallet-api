import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';

import { matchesImageSignature } from './utils/image-signature.util';

// The saved extension must never come from the client-supplied filename
// — that field is fully attacker-controlled and independent of the
// already-validated mimetype (see matchesImageSignature). Mapping the
// extension from the mimetype instead closes that gap. Keep this in sync
// with Uploads.allowedAvatarMimeTypes.
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Owns every filesystem concern for avatars — content validation, where a
// file lives on disk, and cleanup — so UsersService only has to deal with
// "what's the current avatarUrl", never with bytes or paths directly.
@Injectable()
export class AvatarStorageService {
  private readonly logger = new Logger(AvatarStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  // Validates the file's real bytes against its declared mimetype and
  // writes it to disk under a generated name. Returns the public URL to
  // persist on the user; throws if the content isn't a supported image.
  async save(file: Express.Multer.File): Promise<string> {
    // Checked against the in-memory buffer (MulterModule uses
    // memoryStorage — see users.module.ts) before a single byte reaches
    // disk. fileFilter there only checked the client-declared mimetype
    // header, which is spoofable; this confirms the actual bytes are a
    // real image of that type, so an invalid or malicious upload is
    // rejected without ever being written and needing cleanup.
    const isRealImage = matchesImageSignature(file.buffer, file.mimetype);
    if (!isRealImage) {
      this.logger.warn(
        '[avatar-storage-service] - upload rejected, content does not match declared type.',
      );
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Unsupported file type',
      });
    }

    const avatarsDir = this.configService.get<string>(
      'Uploads.avatarsDir',
      'uploads/avatars',
    );
    const extension = AVATAR_MIME_EXTENSIONS[file.mimetype] ?? '';
    const filename = `${randomUUID()}${extension}`;
    await writeFile(join(process.cwd(), avatarsDir, filename), file.buffer);

    return `/uploads/avatars/${filename}`;
  }

  // Best-effort cleanup — a file that fails to delete (already gone,
  // permission issue) shouldn't block the caller's own update from saving.
  async delete(avatarUrl: string): Promise<void> {
    await unlink(join(process.cwd(), avatarUrl)).catch(() => {});
  }
}
