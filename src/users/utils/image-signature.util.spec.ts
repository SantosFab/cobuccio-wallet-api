import { matchesImageSignature } from './image-signature.util';

const REAL_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const REAL_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const REAL_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
// What an attacker sends when spoofing Content-Type: image/jpeg while the
// actual content is HTML/JS meant to run once the file is served back.
const FAKE_IMAGE_HTML_BYTES = Buffer.from('<script>alert(1)</script>\n');

describe('matchesImageSignature', () => {
  it('accepts a real JPEG matched against image/jpeg', () => {
    expect(matchesImageSignature(REAL_JPEG_BYTES, 'image/jpeg')).toBe(true);
  });

  it('accepts a real PNG matched against image/png', () => {
    expect(matchesImageSignature(REAL_PNG_BYTES, 'image/png')).toBe(true);
  });

  it('accepts a real WEBP matched against image/webp', () => {
    expect(matchesImageSignature(REAL_WEBP_BYTES, 'image/webp')).toBe(true);
  });

  it('rejects content that does not match the declared mimetype', () => {
    expect(matchesImageSignature(REAL_PNG_BYTES, 'image/jpeg')).toBe(false);
  });

  it('rejects a spoofed image whose real content is HTML/JS', () => {
    expect(matchesImageSignature(FAKE_IMAGE_HTML_BYTES, 'image/jpeg')).toBe(
      false,
    );
  });

  it('rejects a mimetype outside the known image signatures', () => {
    expect(matchesImageSignature(REAL_JPEG_BYTES, 'application/pdf')).toBe(
      false,
    );
  });

  it('rejects a buffer shorter than the signature length', () => {
    expect(matchesImageSignature(Buffer.from([0xff, 0xd8]), 'image/jpeg')).toBe(
      false,
    );
  });
});
