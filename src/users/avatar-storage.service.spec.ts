import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';

import { AvatarStorageService } from './avatar-storage.service';
import { matchesImageSignature } from './utils/image-signature.util';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'generated-uuid'),
}));

jest.mock('./utils/image-signature.util', () => ({
  matchesImageSignature: jest.fn(),
}));

function buildUploadedFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    mimetype: 'image/jpeg',
    buffer: Buffer.from('fake-jpeg-bytes'),
    ...overrides,
  } as Express.Multer.File;
}

describe('AvatarStorageService', () => {
  let service: AvatarStorageService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AvatarStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (_key: string, defaultValue?: unknown) => defaultValue,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(AvatarStorageService);

    (unlink as jest.Mock).mockClear();
    (writeFile as jest.Mock).mockClear();
    (matchesImageSignature as jest.Mock).mockReturnValue(true);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('save', () => {
    it('rejects without writing to disk when the content does not match the declared mimetype', async () => {
      (matchesImageSignature as jest.Mock).mockReturnValueOnce(false);
      const file = buildUploadedFile();

      const rejection = service.save(file);
      await expect(rejection).rejects.toBeInstanceOf(BadRequestException);
      await expect(rejection).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_FILE_TYPE' },
      });
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('checks the real buffer content against the declared mimetype', async () => {
      const file = buildUploadedFile({ mimetype: 'image/png' });

      await service.save(file);

      expect(matchesImageSignature).toHaveBeenCalledWith(
        file.buffer,
        'image/png',
      );
    });

    it('writes the exact buffer under a generated UUID name with the extension mapped from the mimetype', async () => {
      const file = buildUploadedFile({ mimetype: 'image/png' });

      const avatarUrl = await service.save(file);

      expect(writeFile).toHaveBeenCalledWith(
        join(process.cwd(), 'uploads/avatars', 'generated-uuid.png'),
        file.buffer,
      );
      expect(avatarUrl).toBe('/uploads/avatars/generated-uuid.png');
    });

    it('maps each supported mimetype to its own safe extension', async () => {
      await expect(
        service.save(buildUploadedFile({ mimetype: 'image/jpeg' })),
      ).resolves.toBe('/uploads/avatars/generated-uuid.jpg');
      await expect(
        service.save(buildUploadedFile({ mimetype: 'image/webp' })),
      ).resolves.toBe('/uploads/avatars/generated-uuid.webp');
    });

    // The saved extension must never come from the client — this is the
    // regression test for the original vulnerability: an attacker could
    // otherwise spoof an allowed mimetype while smuggling a dangerous
    // extension through `file.originalname`.
    it('ignores file.originalname entirely when deciding the saved extension', async () => {
      const file = buildUploadedFile({
        mimetype: 'image/jpeg',
        originalname: 'payload.svg',
      });

      const avatarUrl = await service.save(file);

      expect(avatarUrl).toBe('/uploads/avatars/generated-uuid.jpg');
      expect(avatarUrl).not.toContain('svg');
    });
  });

  describe('delete', () => {
    it('unlinks the file at the given avatar URL, resolved against the project root', async () => {
      await service.delete('/uploads/avatars/old.jpg');

      expect(unlink).toHaveBeenCalledWith(
        join(process.cwd(), '/uploads/avatars/old.jpg'),
      );
    });

    it('never throws even when the underlying unlink fails', async () => {
      (unlink as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        service.delete('/uploads/avatars/missing.jpg'),
      ).resolves.toBeUndefined();
    });
  });
});
