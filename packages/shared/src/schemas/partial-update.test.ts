import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as contracts from '../index.js';
import { partialWithoutDefaults } from './partial-update.js';

/**
 * The rule: **a PATCH sends what it sends, and nothing else.**
 *
 * Zod's `.partial()` makes a field optional without removing its `.default()`,
 * and a default fires exactly when the key is absent — so an update schema
 * built that way turns every partial request into a full overwrite. It erased
 * four customer records before anybody worked out where it was happening, and
 * three attempted fixes on the client failed because the client was innocent.
 *
 * The sweep below is the point of this file. Testing the seven schemas that
 * had the bug would not stop the eighth.
 */

describe('every update schema', () => {
  const updateSchemas = Object.entries(contracts).filter(
    (entry): entry is [string, z.ZodType] =>
      /^update[A-Za-z]*Schema$/.test(entry[0]) &&
      typeof (entry[1] as { safeParse?: unknown })?.safeParse === 'function',
  );

  it('is worth sweeping — there are some', () => {
    expect(updateSchemas.length).toBeGreaterThan(5);
  });

  it.each(updateSchemas)('%s invents nothing from an empty body', (_name, schema) => {
    const parsed = schema.safeParse({});
    /*
     * A schema with genuinely required fields is free to refuse an empty body.
     * What it must not do is ACCEPT one and hand back values nobody sent.
     */
    if (!parsed.success) return;
    expect(parsed.data).toEqual({});
  });

  it.each(updateSchemas)('%s carries through only the field it was given', (_name, schema) => {
    /*
     * Probed with a value of every shape, because the one field a schema will
     * accept differs between them. Whichever lands, it must arrive alone.
     */
    for (const probe of [{ notes: 'x' }, { name: 'x' }, { isActive: false }, { city: 'Nashik' }]) {
      const parsed = schema.safeParse(probe);
      if (!parsed.success) continue;
      const keys = Object.keys(parsed.data as object);
      if (keys.length === 0) continue;
      expect(keys).toEqual(Object.keys(probe));
    }
  });
});

describe('partialWithoutDefaults', () => {
  const base = z.object({
    name: z.string(),
    city: z.string().default('NA'),
    isActive: z.boolean().default(true),
    count: z.coerce.number().int().min(0).default(0),
  });

  it('drops the defaults that .partial() leaves behind', () => {
    // What the bug looked like, side by side.
    expect(base.partial().parse({ name: 'A' })).toEqual({
      name: 'A',
      city: 'NA',
      isActive: true,
      count: 0,
    });
    expect(partialWithoutDefaults(base).parse({ name: 'A' })).toEqual({ name: 'A' });
  });

  it('still validates what is actually sent', () => {
    const schema = partialWithoutDefaults(base);
    expect(schema.safeParse({ city: 5 }).success).toBe(false);
    expect(schema.safeParse({ count: -1 }).success).toBe(false);
    /* And coercion survives the unwrapping. */
    expect(schema.parse({ count: '7' })).toEqual({ count: 7 });
  });

  it('lets a field be set to the same value its default would have been', () => {
    // Sending it explicitly is a decision; omitting it is not.
    expect(partialWithoutDefaults(base).parse({ isActive: true })).toEqual({ isActive: true });
  });
});
