import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once, at boot. If anything is missing or malformed
 * the process exits immediately with a readable report rather than failing
 * later with a confusing runtime error.
 */

/**
 * An optional setting, where blank means absent.
 *
 * `.optional()` alone accepts only `undefined`, and a `.env` file cannot
 * express that — `KEY=` and `KEY=""` both arrive as an empty string, which
 * then fails `.min(1)` and takes the whole process down at boot. Since
 * `.env.example` ships exactly that for every credential nobody has yet, a
 * developer copying it got a server that would not start and an error naming a
 * key they had deliberately left blank.
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /**
   * Direct, non-pooled connection. Neon's pooler cannot run the advisory locks
   * and DDL that migrations need, so `prisma migrate` uses this when present
   * while the app keeps using the pooled DATABASE_URL. Unset on plain Postgres.
   */
  DIRECT_URL: optional(z.string().min(1)),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  /*
   * Email. Optional: without a key the app runs normally and only the "send
   * quotation" action reports that it is unavailable, so a developer without
   * credentials is not blocked from everything else.
   */
  RESEND_API_KEY: optional(z.string().min(1)),
  /*
   * Must be an address Resend will send from. `onboarding@resend.dev` needs no
   * domain but only delivers to the Resend account owner; anything else has to
   * be on a domain verified with them.
   */
  MAIL_FROM: z.string().min(1).default('Yuva Polyprint <onboarding@resend.dev>'),
  /** Where replies go, if that should differ from the sender. */
  MAIL_REPLY_TO: optional(z.string().email()),

  /*
   * GSTIN lookup. Optional, and deliberately so: without a key the format and
   * check-digit validation still runs — that is the half that catches typos,
   * and it is free — and only the "Verify" action reports itself unavailable.
   * A developer without credentials is not blocked from anything else.
   */
  GSTIN_API_KEY: optional(z.string().min(1)),
  GSTIN_API_BASE_URL: z.string().url().default('https://api.gstinapi.in'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  console.error(`\nInvalid environment configuration:\n${details}\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isDevelopment: raw.NODE_ENV === 'development',
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
