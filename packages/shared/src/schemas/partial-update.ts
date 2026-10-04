import { z } from 'zod';

/**
 * `.partial()`, without the defaults coming back to bite.
 *
 * **This is not a nicety. `schema.partial()` silently turns every PATCH into a
 * full overwrite.** Zod's `.partial()` makes a field optional; it does not
 * remove its `.default()`, and a default fires precisely when the key is
 * absent. So a caller sending `{ district: 'Nashik' }` to a customer built
 * from a schema whose fields default to `'NA'` gets:
 *
 * ```
 * { district: 'Nashik', address: 'NA', city: 'NA',
 *   mobile: 'NA', email: 'NA', gstNumber: 'NA', ... }
 * ```
 *
 * — and the service spreads that straight into `prisma.update`.
 *
 * This erased four real customer records. Correcting one field on a quotation
 * wiped the address, the city, the mobile and the brand, and three attempts to
 * fix it on the client failed because the client was innocent: it sent exactly
 * the one field that had changed, and the server filled in the rest.
 *
 * Seven of the app's eleven update schemas had it. The worst was not the
 * customer one — a partial quotation update reset a SENT quotation to DRAFT
 * and rewrote its terms, and a partial material update un-retired the
 * material.
 *
 * Validation is untouched: a field that IS sent is checked exactly as before.
 */
/** A field with its `.default()` peeled off, if it had one. */
type WithoutDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;

/**
 * The shape `partialWithoutDefaults` produces.
 *
 * Spelled out rather than inferred, because building the object from a
 * `Record<string, ZodTypeAny>` erases every field's type — and the callers are
 * service functions handing the result to Prisma, which then sees `{}` for
 * every column and refuses the update.
 */
export type PartialWithoutDefaults<Shape extends z.ZodRawShape> = {
  [K in keyof Shape]: z.ZodOptional<WithoutDefault<Shape[K]>>;
};

export function partialWithoutDefaults<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
): z.ZodObject<PartialWithoutDefaults<Shape>> {
  const shape = schema.shape as unknown as Record<string, z.ZodTypeAny>;
  const next: Record<string, z.ZodTypeAny> = {};

  for (const [key, field] of Object.entries(shape)) {
    const def = (field as unknown as { def?: { type?: string; innerType?: z.ZodTypeAny } }).def;
    /* Unwrap one layer of ZodDefault, then make it optional as usual. */
    next[key] =
      def?.type === 'default' && def.innerType ? def.innerType.optional() : field.optional();
  }

  return z.object(next) as z.ZodObject<PartialWithoutDefaults<Shape>>;
}
