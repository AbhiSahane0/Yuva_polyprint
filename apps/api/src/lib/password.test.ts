import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('accepts the right password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('Correct horse battery staple', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('never stores the password itself', async () => {
    const hash = await hashPassword('hunter2');

    expect(hash).not.toContain('hunter2');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);

    expect(a).not.toBe(b);
    await expect(verifyPassword('same', a)).resolves.toBe(true);
    await expect(verifyPassword('same', b)).resolves.toBe(true);
  });

  it('records its own cost parameters, so they can be raised later', async () => {
    const hash = await hashPassword('x');

    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '32768', '8', '1']);
  });

  it('returns false rather than throwing on a corrupt hash', async () => {
    // A damaged row must be a failed login, not a 500 that tells an attacker
    // this account is different from the others.
    for (const bad of ['', 'not-a-hash', 'scrypt$1$2$3', 'scrypt$a$b$c$d$e', '$$$$$']) {
      await expect(verifyPassword('anything', bad)).resolves.toBe(false);
    }
  });

  it('treats visually identical unicode passwords as equal', async () => {
    // "é" composed vs decomposed — a Mac and a phone can submit different bytes
    // for the same typed character.
    const hash = await hashPassword('café-pass');

    await expect(verifyPassword('café-pass', hash)).resolves.toBe(true);
  });
});
