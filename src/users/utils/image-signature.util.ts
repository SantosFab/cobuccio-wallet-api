const SIGNATURE_LENGTH = 12;

// Checks the file's actual first bytes against the real signature of each
// supported image format — independent of whatever Content-Type the
// client declared in the multipart request. fileFilter (users.module.ts)
// only checks that spoofable header, not the content itself, so a
// mismatched or malicious file could otherwise pass as a valid image.
const IMAGE_SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  'image/jpeg': (bytes) =>
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) =>
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a,
  // WEBP files are a RIFF container: "RIFF" + 4-byte chunk size + "WEBP".
  'image/webp': (bytes) =>
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50,
};

// Synchronous and in-memory on purpose: it runs against the upload's
// buffer before a single byte ever reaches disk (see
// UsersService.updateAvatar), so an invalid file is rejected without ever
// being written and needing cleanup afterwards.
export function matchesImageSignature(
  buffer: Buffer,
  mimetype: string,
): boolean {
  const checkSignature = IMAGE_SIGNATURES[mimetype];
  if (!checkSignature) return false;
  if (buffer.length < SIGNATURE_LENGTH) return false;
  return checkSignature(buffer);
}
