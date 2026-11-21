import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt-v1$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored?: string) {
  // Always perform scrypt, including for unknown email addresses.
  const [version, salt, hash] = (stored ?? '').split('$');
  const valid =
    version === 'scrypt-v1' &&
    /^[a-f0-9]{32}$/.test(salt ?? '') &&
    /^[a-f0-9]{128}$/.test(hash ?? '');
  const actual = await derive(password, valid ? salt! : '00000000000000000000000000000000');
  const expected = valid ? Buffer.from(hash!, 'hex') : Buffer.alloc(64);
  return timingSafeEqual(actual, expected) && valid;
}
