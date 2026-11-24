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
  /*
   * The apex domain, not an `api.` subdomain — `api.gstinapi.in` does not
   * resolve at all. Verified against the live service: an unauthenticated
   * GET to `/v1/gstin/:gstin` here answers 401 asking for the x-api-key
   * header, while `/api/v1/...` answers 404.
   */
  GSTIN_API_BASE_URL: z.string().url().default('https://gstinapi.in'),

  /*
   * Cloudflare R2, where design artwork is stored.
   *
   * Optional as a set: with none of it configured the app runs normally and
   * only the artwork panel reports itself unavailable, so a developer without
   * a bucket is not blocked from the rest of the design screen. Configured
   * half-way is a different thing and is refused below — a bucket name with no
   * key would otherwise fail at the first upload, hours later, with a signing
   * error nobody could trace back to a missing line in `.env`.
   */
  R2_ACCOUNT_ID: optional(z.string().min(1)),
  R2_ACCESS_KEY_ID: optional(z.string().min(1)),
  R2_SECRET_ACCESS_KEY: optional(z.string().min(1)),
  R2_BUCKET: optional(z.string().min(1)),
  /*
   * Overrides the endpoint derived from the account id. Needed only for a
   * jurisdiction-specific bucket (`.eu.` or `.fedramp.`), which is signed
   * against a different host.
   */
  R2_ENDPOINT: optional(z.string().url()),

  /*
   * Where the customer's accept link points.
   *
   * The public origin of the WEB app, not this API: the link goes in an email
   * to a customer and has to open a page, not return JSON. Defaulted to the
   * dev server so a link made on a laptop opens on that laptop.
   *
   * Getting this wrong is quiet and expensive — the link is minted, recorded
   * and emailed before anybody discovers it points at localhost — so it is
   * worth checking the first one that goes out.
   */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),

  /*
   * How long an accept link stays live.
   *
   * The printed terms say the quotation is valid for fifteen days, and a link
   * that still accepts a price six months later is an agreement the works
   * never made. Rounded up a little so a customer who answers on the last day
   * is not turned away by an hour.
   */
  QUOTATION_LINK_DAYS: z.coerce.number().int().positive().max(365).default(20),

  /*
   * Where the works is told that a customer has answered.
   *
   * Optional. With neither set the acceptance is still recorded and still
   * shows on the quotation screen — only the nudge is missing, which is what a
   * developer without credentials should get rather than a boot failure.
   */
  OFFICE_ALERT_EMAIL: optional(z.string().email()),
  /** In E.164, with no `whatsapp:` prefix — this adds it. */
  OFFICE_WHATSAPP: optional(z.string().min(8)),

  /*
   * WhatsApp, through Twilio.
   *
   * Optional as a set, and refused half-configured below for the same reason
   * R2 is: a sid with no token fails at the first message with an auth error
   * that reads as a bug in this app.
   *
   * `TWILIO_WHATSAPP_FROM` is the sandbox number while the works' own
   * WhatsApp Business Account is in approval, and the works' number after.
   * Nothing else changes when it is swapped.
   */
  TWILIO_ACCOUNT_SID: optional(z.string().min(1)),
  TWILIO_AUTH_TOKEN: optional(z.string().min(1)),
  TWILIO_WHATSAPP_FROM: optional(z.string().min(8)),
  /*
   * Meta's approved templates, by content SID.
   *
   * A business may not send free text to a customer who has not written to it
   * in the last 24 hours — it must send a template Meta has approved, and the
   * approval is per template. Unset, this falls back to a plain body, which is
   * what the Twilio sandbox accepts and what a real number will refuse.
   */
  TWILIO_TEMPLATE_QUOTATION_SENT: optional(z.string().min(1)),
  TWILIO_TEMPLATE_QUOTATION_ACCEPTED: optional(z.string().min(1)),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
});

const R2_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const;

/**
 * R2 is all four settings or none of them.
 *
 * Three out of four boots happily and then fails on the first upload with a
 * signature error, which reads as a bug in this app rather than as a line
 * missing from `.env`. Refusing at boot names the missing key instead.
 */
const TWILIO_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'] as const;

const r2Schema = envSchema
  .superRefine((value, ctx) => {
    const missing = R2_KEYS.filter((key) => value[key] === undefined);
    if (missing.length === 0 || missing.length === R2_KEYS.length) return;
    ctx.addIssue({
      code: 'custom',
      path: ['R2_BUCKET'],
      message: `Cloudflare R2 needs all of ${R2_KEYS.join(', ')} or none. Missing: ${missing.join(', ')}`,
    });
  })
  /* Same rule, same reason: half-configured WhatsApp boots and then fails at
     the first message with an authentication error nobody traces back here. */
  .superRefine((value, ctx) => {
    const missing = TWILIO_KEYS.filter((key) => value[key] === undefined);
    if (missing.length === 0 || missing.length === TWILIO_KEYS.length) return;
    ctx.addIssue({
      code: 'custom',
      path: ['TWILIO_WHATSAPP_FROM'],
      message: `WhatsApp needs all of ${TWILIO_KEYS.join(', ')} or none. Missing: ${missing.join(', ')}`,
    });
  });

const parsed = r2Schema.safeParse(process.env);

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
