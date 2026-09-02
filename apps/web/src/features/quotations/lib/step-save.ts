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
  brandName: string;
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
    brandName: normalise(customer.brandName),
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
 */
export function changedCustomerFields(
  baseline: CustomerDetails,
  current: CustomerDetails,
): Partial<CustomerDetails> | null {
  const changed: Partial<CustomerDetails> = {};

  for (const key of Object.keys(baseline) as (keyof CustomerDetails)[]) {
    if (normalise(current[key]) !== baseline[key]) changed[key] = normalise(current[key]);
  }

  return Object.keys(changed).length > 0 ? changed : null;
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
