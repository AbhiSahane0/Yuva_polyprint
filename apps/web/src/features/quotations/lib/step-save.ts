import type { CustomerDetail, CustomerJob, SaveQuotationJobInput } from '@yuva/shared';

/**
 * What the wizard persists as the office steps through it, and when.
 *
 * The rule is that **nothing is written unless something changed**. Each step
 * compares what is on screen against a baseline of what the server already
 * holds, and only calls the API when the two differ. The baseline then moves
 * forward, so stepping back and forward again is free — no request, no second
 * copy of anything.
 *
 * These are plain functions rather than part of the component so the comparison
 * can be tested directly. It is the piece that decides whether money and rows
 * get spent, and it is far too easy to get subtly wrong in a `useEffect`.
 */

/** The customer fields the quotation form can edit. */
export interface CustomerDetails {
  companyName: string;
  address: string;
  city: string;
  district: string;
  mobile: string;
  email: string;
  gstNumber: string;
}

/**
 * 'NA' is the importer's placeholder, and the form shows it as an empty box.
 *
 * Normalising both sides through this is the whole trick: without it, loading a
 * customer whose address is 'NA' and touching nothing would look like a change
 * from 'NA' to '', and every quotation would write a pointless update.
 */
export function normalise(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed === 'NA' ? '' : trimmed;
}

/** What the server currently holds for this customer, in the form's terms. */
export function baselineFromCustomer(customer: CustomerDetail): CustomerDetails {
  return {
    companyName: normalise(customer.companyName),
    address: normalise(customer.address),
    city: normalise(customer.city),
    district: normalise(customer.district),
    mobile: normalise(customer.mobile),
    email: normalise(customer.email),
    gstNumber: normalise(customer.gstNumber),
  };
}

/**
 * The fields that actually changed, or null when none did.
 *
 * Returns a partial rather than a boolean so the update carries only what
 * moved. A colleague editing the same customer's mobile in another tab keeps
 * their edit when this quotation only touched the address.
 *
 * **A field is written only if the office changed it on this screen.** That is
 * `current` differing from `shown` — what the form was last filled in with —
 * and not merely from `baseline`. The distinction is what stops a customer's
 * address being wiped: on an existing quotation the form is filled from the
 * document's own stored snapshot, which can legitimately differ from the
 * customer's record, and comparing against the record alone made every one of
 * those differences look like a deliberate edit. Empty strings are stored as
 * 'NA', so "looks like an edit" meant "erase it".
 *
 * react-hook-form's `dirtyFields` cannot answer this: dirty means "differs from
 * defaultValues", and the form is populated twice — once by `reset` from the
 * quotation and once by the prefill from the customer — so fields nobody
 * touched are marked dirty whenever those two disagree.
 */
export function changedCustomerFields(
  baseline: CustomerDetails,
  current: CustomerDetails,
  shown: CustomerDetails,
): Partial<CustomerDetails> | null {
  const changed: Partial<CustomerDetails> = {};

  for (const key of Object.keys(baseline) as (keyof CustomerDetails)[]) {
    const now = normalise(current[key]);

    // Untouched since the form was filled in: nothing the office decided.
    if (now === normalise(shown[key])) continue;

    /*
     * **An empty value never overwrites a stored one.**
     *
     * This is the rule that matters, and it is deliberately blunt. Every
     * observed failure of this write-back had the same shape: the form reported
     * a field as empty when it was not, and 'NA' — what an empty string is
     * stored as — replaced a real address. It happened three times against a
     * real record, and two attempts to fix the cause did not stop it.
     *
     * The cost is that a field cannot be *cleared* from the quotation screen;
     * the customer editor does that, where the whole record is in front of you
     * and clearing one is unmistakably deliberate. That is a small loss against
     * a customer's address disappearing because somebody corrected their
     * district on a quotation.
     */
    if (now === '' && baseline[key] !== '') continue;

    if (now !== baseline[key]) changed[key] = now;
  }

  return Object.keys(changed).length > 0 ? changed : null;
}

/** The customer fields as the quotation form currently holds them. */
export function customerDetailsFromForm(values: {
  customerName?: string | undefined;
  addressLine1?: string | undefined;
  addressLine2?: string | undefined;
  addressLine3?: string | undefined;
  mobile?: string | undefined;
  email?: string | undefined;
  gstNumber?: string | undefined;
}): CustomerDetails {
  return {
    companyName: values.customerName ?? '',
    address: values.addressLine1 ?? '',
    city: values.addressLine2 ?? '',
    district: values.addressLine3 ?? '',
    mobile: values.mobile ?? '',
    email: values.email ?? '',
    gstNumber: values.gstNumber ?? '',
  };
}

/** A quotation line, as much of it as a job row can hold. */
export interface LineForJob {
  jobName: string;
  jobKind: string;
  pouchType: string | null;
  widthMm: number;
  heightMm: number;
  cylinderCount: number;
  /** Outermost ply first. */
  microns: number[];
  pouchesPerKg: number;
}

/**
 * A line in the shape the job endpoint wants.
 *
 * The jobs table has three fixed ply slots — printed, optional metallised,
 * sealant — so the line's plies map onto them by position. This mirrors
 * `jobDataFromQuotationItem` on the server, which is what runs when a quotation
 * is won; the two must agree or a design would differ depending on which door
 * it came through.
 */
export function jobPayloadFromLine(line: LineForJob): SaveQuotationJobInput {
  const plies = line.microns.filter((micron) => micron > 0);
  const outer = plies[0] ?? null;
  const middle = plies.length >= 3 ? plies[1] : null;
  const sealant = plies.length >= 2 ? plies[plies.length - 1] : null;

  return {
    jobName: line.jobName.trim(),
    jobType: line.jobKind === 'ROLL' ? 'Roll' : 'Pouch',
    pouchType: line.pouchType ?? 'NA',
    layer: plies.length,
    petMicron: outer,
    metPetMicron: middle,
    polyMicron: sealant ?? 0,
    designOpenWidth: line.widthMm,
    designHeight: line.heightMm,
    totalCylinders: line.cylinderCount,
    petGsm: null,
    metPetGsm: null,
    polyGsm: null,
    pouchesPerKg: String(line.pouchesPerKg),
  } as SaveQuotationJobInput;
}

/**
 * A design, reduced to the string that decides whether it needs saving.
 *
 * Comparing serialised designs rather than tracking react-hook-form's dirty
 * flags on purpose: dirty means "somebody typed here", which is true after
 * typing a digit and deleting it again. What matters is whether the value ends
 * up different from what the server holds.
 */
export function designFingerprint(payload: SaveQuotationJobInput): string {
  /*
   * Every measurement goes through this before it is compared.
   *
   * The jobs table stores these as Prisma Decimals, which JSON-serialise as
   * strings — so a job read back from the customer detail carries `"12"` where
   * the form carries `12`. Comparing those directly makes every design look
   * edited, and the wizard issued a PATCH on every single Next: silent write
   * amplification, and a saved job quietly rewritten by a form that only knows
   * a subset of its fields.
   */
  const measure = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return JSON.stringify([
    payload.jobName.trim().toLowerCase(),
    payload.jobType,
    payload.pouchType,
    measure(payload.layer),
    measure(payload.petMicron),
    // A ply the jobs table records as 0 and one it leaves null both mean "no
    // metallised layer". Treated as the same, or a three-slot row imported as 0
    // would never stop looking different from a two-ply line.
    measure(payload.metPetMicron) || null,
    measure(payload.polyMicron),
    measure(payload.designOpenWidth),
    measure(payload.designHeight),
    measure(payload.totalCylinders),
  ]);
}

/** The same fingerprint, taken from a job already on record. */
export function fingerprintFromSavedJob(job: CustomerJob, jobKind = 'Pouch'): string {
  return designFingerprint({
    jobName: job.jobName,
    jobType: jobKind,
    pouchType: job.pouchType ?? 'NA',
    layer: [job.petMicron, job.metPetMicron, job.polyMicron].filter(
      (micron) => Number(micron ?? 0) > 0,
    ).length,
    petMicron: job.petMicron,
    metPetMicron: job.metPetMicron,
    polyMicron: job.polyMicron,
    designOpenWidth: job.designOpenWidth,
    designHeight: job.designHeight,
    totalCylinders: job.totalCylinders,
    petGsm: null,
    metPetGsm: null,
    polyGsm: null,
    pouchesPerKg: 'NA',
  } as SaveQuotationJobInput);
}

/**
 * Whether a line is complete enough to be worth recording as a design.
 *
 * A half-typed line is not a job. Saving one would leave the customer holding a
 * nameless or sizeless design that somebody has to find and delete later, which
 * is worse than not saving it — the quotation still carries every field, and
 * winning it creates whatever is missing.
 */
export function isSaveableDesign(line: LineForJob): boolean {
  return line.jobName.trim().length > 0 && line.widthMm > 0 && line.heightMm > 0;
}
