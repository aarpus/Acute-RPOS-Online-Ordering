import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';

const pbkdf2Iterations = 100_000;

function derivePasswordKey(password: string, salt: Buffer, iterations: number, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    pbkdf2(password, salt, iterations, keyLength, 'sha256', (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derivePasswordKey(password, salt, pbkdf2Iterations, 32);
  return `pbkdf2$${pbkdf2Iterations}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  if (!Number.isInteger(iterations) || iterations < 1 || !salt.length || !expected.length) return false;
  const derived = await derivePasswordKey(password, salt, iterations, expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
