import { useEffect, useState } from 'react';
import type { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import {
  formatRs,
  isWorkbookPouch,
  type CreateQuotationFormValues,
  type PouchType,
} from '@yuva/shared';
import { Field, NumberInput } from '@/components/ui/Field';

/**
 * The four figures a quotation may set for itself, folded away until asked for.
 *
 * **They were four empty boxes at the top of the jobs step**, above the job the
 * office had actually come to price, on every quotation. Almost none of them is
 * ever touched: the works has these figures on the Costing screen and means
 * them, and an override is the rare job that is not the ordinary case — the
 * client's own sheets carry margins of 5%, 9% and 10% across seven quotations,
 * and nothing charged for pouch making on the two sold as reels.
 *
 * So the section is now one line of what this quotation is priced at, and a
 * checkbox. Ticking it opens the boxes **already filled in with the works' own
 * figures**, which is the other half: a blank box with the number greyed behind
 * it reads as a field that still needs doing, and it is the one place a figure
 * is known and the screen was being coy about it.
 *
 * **Untouched means the works' figure, not a copy of it.** Anything still equal
 * to the master when the quotation is saved is sent blank — see
 * `strippedCosting` — so a quotation that never really overrode anything goes
 * on following the Costing screen, dated, exactly as it did when the boxes were
 * empty. Unticking clears all four, which is how an override is taken back.
 */

/** What the works itself charges, from the Costing screen for this date. */
export interface CostingMasters {
  marginPercent: number;
  transportPerKg: number;
  defaultWastagePercent: number;
  pouchWastagePercent: number;
}

/** The four fields, as the form holds them: strings while they are being typed. */
export type CostingField =
  'marginPercent' | 'transportPerKg' | 'pouchMakingPerKg' | 'wastagePercent';

const FIELDS: CostingField[] = [
  'marginPercent',
  'transportPerKg',
  'pouchMakingPerKg',
  'wastagePercent',
];

const text = (value: unknown): string => (value === null || value === undefined ? '' : `${value}`);

/**
 * The wastage this quotation would run at, when its jobs agree on one.
 *
 * The works has two figures — 8% on the Estimation sheet, 7% in the pouch
 * workbook — and which applies is decided per job by its style, not per
 * quotation. So there is a number to fill in only when every job on the
 * document falls the same side of that line. Mixed, the box stays empty and
 * says "by job kind", because any single figure would be wrong for half of it.
 */
function wastageMaster(
  masters: CostingMasters,
  pouchTypes: (PouchType | null | undefined)[],
): string {
  if (pouchTypes.length === 0) return '';
  const workbook = isWorkbookPouch(pouchTypes[0]);
  if (!pouchTypes.every((type) => isWorkbookPouch(type) === workbook)) return '';
  return String(workbook ? masters.pouchWastagePercent : masters.defaultWastagePercent);
}

/**
 * What the works' own figure is for each box, or '' where there is no single one.
 *
 * Pouch making has none, and cannot: the works charges it **per pouch**, and
 * the same charge reads between Rs 11 and Rs 64 a kilogram across its own nine
 * costed pouches depending on nothing but how big the pouch is. A per-kilogram
 * figure exists only once a job has a size, so there is nothing to put in a box
 * that sits above all the jobs. It keeps its "by style" hint.
 */
function mastersFor(
  masters: CostingMasters,
  pouchTypes: (PouchType | null | undefined)[],
): Record<CostingField, string> {
  return {
    marginPercent: String(masters.marginPercent),
    transportPerKg: String(masters.transportPerKg),
    pouchMakingPerKg: '',
    wastagePercent: wastageMaster(masters, pouchTypes),
  };
}

/**
 * The four fields with anything still equal to the works' own figure unset.
 *
 * Called on the way to the server, so that opening the section, reading the
 * figures and closing it again leaves no trace — which is what "untouched" has
 * to mean once the boxes arrive filled in rather than empty. Without it, every
 * quotation whose costing was so much as glanced at would be frozen against a
 * Costing screen it never meant to leave.
 *
 * Works on the values as the FORM holds them — strings, which the schema turns
 * into numbers or into nothing at all — and hands back the same, so what comes
 * out can be spread straight over what went in. Compared as numbers, so 9 and
 * "9.0" are the same answer.
 */
export function strippedCosting(
  values: Partial<Record<CostingField, unknown>>,
  masters: CostingMasters,
  pouchTypes: (PouchType | null | undefined)[],
): Pick<CreateQuotationFormValues, CostingField> {
  const own = mastersFor(masters, pouchTypes);
  const out = {} as Pick<CreateQuotationFormValues, CostingField>;
  for (const field of FIELDS) {
    const typed = text(values[field]).trim();
    const master = own[field];
    const same = typed !== '' && master !== '' && Number(typed) === Number(master);
    out[field] = same ? '' : typed;
  }
  return out;
}

export function CostingOverrides({
  register,
  setValue,
  values,
  masters,
  pouchTypes,
}: {
  register: UseFormRegister<CreateQuotationFormValues>;
  setValue: UseFormSetValue<CreateQuotationFormValues>;
  values: Partial<Record<CostingField, unknown>>;
  masters: CostingMasters;
  pouchTypes: (PouchType | null | undefined)[];
}) {
  const [open, setOpen] = useState(false);
  const filled = FIELDS.some((field) => text(values[field]).trim() !== '');

  /*
   * A saved quotation that overrode something opens with its figures showing,
   * because hiding a number this document is actually priced at would be worse
   * than the four empty boxes this replaces. It only ever opens: once the
   * office unticks, every field is cleared, so nothing here reopens it.
   */
  useEffect(() => {
    if (filled) setOpen(true);
  }, [filled]);

  const own = mastersFor(masters, pouchTypes);

  function toggle(next: boolean) {
    setOpen(next);

    if (!next) {
      for (const field of FIELDS) setValue(field, '' as never, { shouldDirty: true });
      return;
    }

    for (const field of FIELDS) {
      if (text(values[field]).trim() !== '' || own[field] === '') continue;
      setValue(field, own[field] as never, { shouldDirty: true });
    }
  }

  /**
   * What this quotation is priced at, in one line, while the boxes are away.
   *
   * Always the works' own figures, and that is not a simplification: the
   * section is open whenever any of the four is set, so a closed section has
   * nothing in it to report. Folding them away must not mean the office cannot
   * see what the document is priced at — that would be worse than the boxes.
   */
  const summary = [
    `Margin ${own.marginPercent}%`,
    `Transport ${formatRs(Number(own.transportPerKg), 2)}/kg`,
    `Wastage ${own.wastagePercent === '' ? 'by job kind' : `${own.wastagePercent}%`}`,
    'Pouch making by style',
  ].join(' · ');

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h4 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">
          This quotation&rsquo;s costing
        </h4>
        <p className="text-ink-500 mt-0.5 text-xs">
          {open ? 'Left as the works’ own figure, a box follows the Costing screen.' : summary}
        </p>
      </div>

      {open ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <Field label="Margin %" htmlFor="marginPercent">
              <NumberInput
                id="marginPercent"
                placeholder={own.marginPercent}
                {...register('marginPercent')}
              />
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field label="Transport, Rs/kg" htmlFor="transportPerKg">
              <NumberInput
                id="transportPerKg"
                placeholder={own.transportPerKg}
                {...register('transportPerKg')}
              />
            </Field>
          </div>
          <div className="sm:col-span-4">
            {/*
              Per KILOGRAM, where the works' figure is per pouch, and that is
              deliberate: this replaces the whole charge rather than any part of
              it. "Charge Rs 20 a kilo for making on this one, whatever the
              style says" is what the office actually means when it overrides,
              and it is the unit every quotation written before the charge
              became per pouch already carries.
            */}
            <Field
              label="Pouch making, Rs/kg"
              htmlFor="pouchMakingPerKg"
              hint="Blank follows the style; zero on a reel"
            >
              <NumberInput
                id="pouchMakingPerKg"
                placeholder="by style"
                {...register('pouchMakingPerKg')}
              />
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field
              label="Wastage %"
              htmlFor="wastagePercent"
              hint="Film spoiled setting up and running"
            >
              <NumberInput
                id="wastagePercent"
                placeholder={own.wastagePercent === '' ? 'by job kind' : own.wastagePercent}
                {...register('wastagePercent')}
              />
            </Field>
          </div>
        </div>
      ) : null}

      <label className="flex w-fit cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          className="accent-brand-600 size-4 cursor-pointer"
          checked={open}
          onChange={(event) => toggle(event.target.checked)}
        />
        <span className="text-ink-700 text-sm">Edit this quotation&rsquo;s costing</span>
      </label>
    </section>
  );
}
