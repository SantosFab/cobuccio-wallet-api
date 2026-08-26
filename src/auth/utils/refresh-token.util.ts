import { createHash, randomBytes } from 'crypto';

// Opaque token, not a JWT — doesn't need its own secret. High entropy
// (64 random bytes) is what makes it unguessable, so it doesn't need a
// slow adaptive hash like argon2 either (that's for low-entropy secrets
// like passwords); a fast sha256 digest is enough to avoid storing the
// plaintext token in the database.
export function generateRefreshToken(): string {
  return randomBytes(64).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
