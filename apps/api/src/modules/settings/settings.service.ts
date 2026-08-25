import { DEFAULT_SETTINGS, settingsSchema, type AppSettings } from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';

/**
 * Settings live as key/value rows so adding one never needs a migration.
 * Anything missing falls back to the documented default, which means the
 * system works on a fresh database with no seeding step.
 */
export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));

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

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      }),
    ),
  );

  return getSettings();
}
