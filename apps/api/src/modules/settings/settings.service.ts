import { DEFAULT_SETTINGS, settingsSchema, type AppSettings } from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';
import { valuesAsAt } from './setting-history.js';

/** Midnight UTC on a yyyy-mm-dd, which is how dated rows are stored. */
function asDate(iso: string): Date {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Settings live as key/value rows so adding one never needs a migration.
 * Anything missing falls back to the documented default, which means the
 * system works on a fresh database with no seeding step.
 *
 * `onDate` asks what the works held **then**. Material rates have always
 * answered that; settings could not, so a quotation dated 2022 was repriced at
 * today's overheads and could never reproduce itself. The client's own sheets
 * carry a bank EMI of Rs 4,166.66 in March and Rs 10,000 in July of the same
 * year — one figure, changed in between.
 *
 * Today, or no date at all, reads the current row: that is the value the works
 * is working to, and it cannot drift from the history because it is not derived
 * from it. Only a date in the past consults the record of changes.
 */
export async function getSettings(onDate?: string): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany();
  let stored: Record<string, string> = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  if (onDate && onDate < today()) {
    const history = await prisma.appSettingHistory.findMany({
      select: { key: true, value: true, effectiveDate: true },
    });
    stored = valuesAsAt(
      stored,
      history.map((row) => ({
        key: row.key,
        value: row.value,
        effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
      })),
      onDate,
    );
  }

  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const raw = stored[key];
    if (raw === undefined) continue;

    // Settings are all stored as text; only replace a numeric default with a
    // number, so a malformed row cannot turn a rate into NaN.
    if (typeof DEFAULT_SETTINGS[key as keyof AppSettings] === 'number') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) merged[key] = parsed;
    } else {
      merged[key] = raw;
    }
  }

  // Re-validate so a hand-edited row cannot put nonsense into a quotation.
  const result = settingsSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_SETTINGS;
}

/**
 * Changes a setting, and records when it changed.
 *
 * The change is dated today, which is what saving the Costing screen means:
 * "this is what the works pays from now on". Correcting what a figure was
 * months ago is not something the screen offers — it would be rewriting the
 * basis of quotations already sent.
 */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return getSettings();

  const effectiveDate = asDate(today());

  await prisma.$transaction([
    ...entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      }),
    ),
    /* Changed twice in a day is one change; the day is what a quotation asks for. */
    ...entries.map(([key, value]) =>
      prisma.appSettingHistory.upsert({
        where: { key_effectiveDate: { key, effectiveDate } },
        create: { key, value: String(value), effectiveDate },
        update: { value: String(value) },
      }),
    ),
  ]);

  return getSettings();
}
