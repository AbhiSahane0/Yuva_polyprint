import { useEffect, useRef, useState } from 'react';
import type { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { isWorkbookPouch, type CreateQuotationFormValues, type PouchType } from '@yuva/shared';
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
 * So the section is now a single checkbox. Ticking it opens the boxes **already
 * filled in with the works' own figures**, which is the other half: a blank box
 * with the number greyed behind it reads as a field that still needs doing, and
 * it is the one place a figure is known and the screen was being coy about it.
 *
 * **Nothing is shown while it is closed.** It did carry a heading and a line of
 * what the document was priced at, and the client asked for both to go: the
 * office reads this screen with the customer across the desk, and the margin is
 * not the customer's business. See the comment on the checkbox.
 *
 * **Untouched means the works' figure, not a copy of it.** Anything still equal
 * to the master when the quotation is saved is sent blank — see
 * `strippedCosting` — so a quotation that never really overrode anything goes
 * on following the Costing screen, dated, exactly as it did when the boxes were
 * empty. Unticking clears all four, which is how an override is taken back.
 */

/** What the works itself charges, from the Costing screen for this date. */
export interface CostingMasters {
  /**
   * The margin in force, where one figure covers the whole document.
   *
   * Not the Costing screen's figure: since the margin follows the volume —
   * 15% to 500 kg, 10% above — the margin actually applied is chosen per
   * QUANTITY, and a document priced at 250, 500 and 1,000 kg is costed at
   * 15%, 15% and 10%. There is a single figure to offer only when every
   * costable quantity on it falls the same side of the break.
   *
   * Null otherwise, and the box stays empty saying "by quantity" — the same
   * shape as wastage, and for the same reason. Filling in 9% there, which is
   * what this used to do, was not a display fault: the box is an override, so
   * it took the margin off every tier of a document nobody meant to discount.
   */
  marginPercent: number | null;
  transportPerKg: number;
  defaultWastagePercent: number;
  pouchWastagePercent: number;
  /**
   * Making, per kilogram, worked out for THIS quotation.
   *
   * Not a figure on the Costing screen — the works charges making per pouch,
   * and what that comes to on a kilogram depends entirely on how big the pouch
   * is. The page derives it from the style and the size that have been typed.
   * Null where no single figure applies: before a job has a size, on a document
   * whose jobs disagree, and on one that makes no pouches at all.
   */
  pouchMakingPerKg: number | null;
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
 * Two of the four are read straight off the Costing screen. The other two are
 * worked out for this document — wastage from the styles on it, making from the
 * style and size of each job — because neither is a number the works holds one
 * of. Where that working cannot land on a single figure the box stays empty and
 * says what decides it instead.
 */
function mastersFor(
  masters: CostingMasters,
  pouchTypes: (PouchType | null | undefined)[],
): Record<CostingField, string> {
  return {
    marginPercent: masters.marginPercent === null ? '' : String(masters.marginPercent),
    transportPerKg: String(masters.transportPerKg),
    pouchMakingPerKg: masters.pouchMakingPerKg === null ? '' : String(masters.pouchMakingPerKg),
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

  /* What was last written into each box on the works' behalf, so a box still
     holding it can be told apart from one somebody typed. */
  const applied = useRef<Partial<Record<CostingField, string>>>({});

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

  /*
   * An open box goes on following the works' figure until somebody types in it.
   *
   * Two of the four are derived from the jobs — making from the style and size,
   * wastage from the styles — so they move while the section is open and the
   * office edits the job below it. Without this, a figure filled in before a
   * pouch was resized would sit there looking like the works' own, no longer be
   * equal to it, and so survive the strip on save as a deliberate override
   * nobody made. It follows only a box still holding exactly what was last
   * written into it; a typed figure is theirs and is left alone.
   */
  useEffect(() => {
    if (!open) return;
    for (const field of FIELDS) {
      const was = applied.current[field];
      if (was === undefined || own[field] === was) continue;
      if (text(values[field]).trim() !== was) continue;
      applied.current[field] = own[field];
      setValue(field, own[field] as never, { shouldDirty: true });
    }
  });

  function toggle(next: boolean) {
    setOpen(next);

    if (!next) {
      applied.current = {};
      for (const field of FIELDS) setValue(field, '' as never, { shouldDirty: true });
      return;
    }

    for (const field of FIELDS) {
      if (text(values[field]).trim() !== '' || own[field] === '') continue;
      applied.current[field] = own[field];
      setValue(field, own[field] as never, { shouldDirty: true });
    }
  }

  return (
    <section className="flex flex-col gap-3">
      {/*
        The checkbox is the whole of this section while it is closed.

        It used to carry a heading and a line of what the document was priced
        at — "Margin 9% · Transport Rs. 6.80/kg · …" — and the client asked for
        both to go, for the same reason the margin percentages lost their words:
        a quotation is read across a desk with the customer on the other side of
        it, and what the works makes on the job is not their business. The
        figures are still one tick away for the office, and the costing
        breakdown on the rate still carries all of them.
      */}
      <label className="flex w-fit cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          className="accent-brand-600 size-4 cursor-pointer"
          checked={open}
          onChange={(event) => toggle(event.target.checked)}
        />
        <span className="text-ink-700 text-sm">Edit this quotation&rsquo;s costing</span>
      </label>

      {open ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <p className="text-ink-500 -mt-1 text-xs sm:col-span-12">
            Left as the works&rsquo; own figure, a box follows the Costing screen.
          </p>
          <div className="sm:col-span-4">
            {/*
              Empty where the document straddles the 500 kg break, because
              there is no one margin in force to show — see `CostingMasters`.
            */}
            <Field
              label="Margin %"
              htmlFor="marginPercent"
              hint="Blank follows the volume: 15% to 500 kg, 10% above"
            >
              <NumberInput
                id="marginPercent"
                placeholder={own.marginPercent === '' ? 'by quantity' : own.marginPercent}
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
                placeholder={own.pouchMakingPerKg === '' ? 'by style' : own.pouchMakingPerKg}
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
    </section>
  );
}
