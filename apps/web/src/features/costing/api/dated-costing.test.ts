import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * **A quotation is costed on its own date, on the screen as well as on the
 * server.**
 *
 * The whole system turns on this. Rates, wages, overheads and the works' own
 * figures all carry effective dates, the server prices a quotation at its own
 * date, and the seven 2022 quotations reproduce to the paisa because of it.
 *
 * The screen did not. `QuotationFormPage` read the film rates and the works'
 * four figures at the quotation's date, but the job card beneath them called
 * `useRateCosting` without one — so the panel costed on **today's** wages,
 * power, wastage, surcharges and pouch-making bands against film rates from
 * the day the quotation was written. A document from last week showed a rate
 * the server would never have stored.
 *
 * It was not a missing feature: `RateCostingOverrides.onDate` existed, with a
 * comment describing this exact failure. The caller simply never passed it,
 * and nothing failed when it didn't.
 *
 * These read the source because what went wrong is a value not being handed
 * over. Rendering the page proves the figures agree for whatever date the test
 * picks; this proves the date is passed at all.
 */
const read = (path: string): string =>
  readFileSync(resolve(__dirname, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const FORM = read('../../quotations/pages/QuotationFormPage.tsx');
const HOOK = read('./use-rate-costing.ts');

describe('the costing panel is dated', () => {
  it('hands the job card the quotation’s date, not today', () => {
    const overrides = FORM.slice(FORM.indexOf('costingOverrides={{'));
    expect(overrides.slice(0, overrides.indexOf('}}'))).toContain('onDate: pricingDate');
  });

  it('reads the settings and the works’ costing at that date', () => {
    // Both, not one. The settings carry wastage, ink GSM and the pouch-making
    // bands; the master carries the machines, the wages and the overheads.
    expect(HOOK).toContain('useSettings(overrides.onDate)');
    expect(HOOK).toContain('useCostingMasterData(false, overrides.onDate)');
  });

  it('recomputes when the date moves', () => {
    /*
     * The costing is memoised on a key built from the overrides. A date that
     * changed without being in that key would leave yesterday's figures on
     * screen under today's heading, which is worse than the bug it replaced.
     */
    const key = HOOK.slice(HOOK.indexOf('const overrideKey = ['));
    expect(key.slice(0, key.indexOf(']'))).toContain('overrides.onDate');
  });

  /**
   * Found alongside the date, and the same shape of fault: a figure the office
   * types that the costing never looks at again.
   *
   * Wastage inflates the film bought and film is about four-fifths of a rate,
   * so a wastage override that silently did nothing until some other figure
   * moved is among the worst to lose.
   */
  it('recomputes when a wastage override is typed', () => {
    const key = HOOK.slice(HOOK.indexOf('const overrideKey = ['));
    expect(key.slice(0, key.indexOf(']'))).toContain('overrides.wastagePercent');
  });

  it('keeps every typed override in that key', () => {
    // Stated as a set rather than four separate expectations, so a fifth
    // override added later is a failure here rather than a silent omission.
    const key = HOOK.slice(HOOK.indexOf('const overrideKey = ['));
    const body = key.slice(0, key.indexOf(']'));
    for (const field of ['marginPercent', 'transportPerKg', 'pouchMakingPerKg', 'wastagePercent']) {
      expect(body).toContain(`overrides.${field}`);
    }
  });
});

/**
 * **All four overrides survive a round trip through the edit screen.**
 *
 * `wastagePercent` did not. It was absent from the mapping that fills the form
 * from a saved quotation, so a document that set its own wastage read back as
 * blank — and `strippedCosting` then sent that blank to the server, which took
 * it as "follow the works" and repriced the document. Wastage inflates the
 * film bought and film is four-fifths of a rate, so losing it silently moves
 * real money.
 *
 * Checked as a set rather than one by one, because the fault was an omission:
 * three of the four were there, which is exactly what makes it easy to miss.
 */
describe('the quotation’s own costing figures survive being reopened', () => {
  it('fills every one of the four from the saved document', () => {
    const reset = FORM.slice(FORM.indexOf('marginPercent: existing.marginPercent'));
    const body = reset.slice(0, reset.indexOf('items: existing.items'));
    for (const field of ['marginPercent', 'transportPerKg', 'pouchMakingPerKg', 'wastagePercent']) {
      expect(body).toContain(`${field}: existing.${field} ?? ''`);
    }
  });
});
