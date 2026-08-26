import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

/*
 * promisify() picks the 3-argument overload, which drops the options parameter
 * these cost settings depend on. Declaring the shape we actually call keeps
 * that visible rather than casting at each call site.
 */
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/*
 * scrypt from Node's own crypto rather than bcrypt.
 *
 * It is memory-hard, which is the property that matters against GPU cracking,
 * and it is built in — so the Alpine image needs no native module and no
 * node-gyp toolchain. bcrypt would have meant either a compiler in the build
 * stage or a pure-JS port an order of magnitude slower.
 *
 * N=2^15 costs roughly 100ms per hash here, which is unnoticeable on a login
 * and expensive in bulk. maxmem must be raised explicitly: Node's 32MB default
 * is below what these parameters need and scrypt would otherwise throw.
 */
const KEYLEN = 64;
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const PREFIX = 'scrypt';

/** `scrypt$N$r$p$salt$hash`, self-describing so the cost can be raised later. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(plain.normalize('NFKC'), salt, KEYLEN, PARAMS)) as Buffer;
  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/**
 * Checks a password against a stored hash.
 *
 * Never throws on a malformed hash — it returns false, so a corrupt row is a
 * failed login rather than a 500 that distinguishes it from a wrong password.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, n, r, p, salt, expected] = parts as [string, string, string, string, string, string];
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'base64url');
  let derived: Buffer;
  try {
    derived = (await scrypt(
      plain.normalize('NFKC'),
      Buffer.from(salt, 'base64url'),
      expectedBuffer.length,
      params,
    )) as Buffer;
  } catch {
    return false;
  }

  // Constant time: a length check first, because timingSafeEqual throws on a
  // mismatch and that throw would itself be a timing signal.
  if (derived.length !== expectedBuffer.length) return false;
  return timingSafeEqual(derived, expectedBuffer);
}
