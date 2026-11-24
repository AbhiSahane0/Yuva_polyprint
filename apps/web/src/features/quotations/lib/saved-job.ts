import type { UseFormSetValue } from 'react-hook-form';
import type {
  CreateQuotationFormValues,
  CustomerJob,
  JobColour,
  QuotationCylinderRepair,
} from '@yuva/shared';

type ItemValues = NonNullable<CreateQuotationFormValues['items']>[number];

/**
 * **Putting a saved job onto a line.**
 *
 * A customer the works already prints for has its designs on record: the open
 * width, the height, the plies and how many cylinders were cut. Choosing one
 * fills all of that in and marks the line as a repeat, so it is not quoted for
 * cylinders a second time.
 *
 * The rule lives here because two screens now apply it — the job name on the
 * Customer step and the saved-job picker on the Jobs step — and a rule read
 * two ways cannot be kept in step by care. The same reason `itemFormValues`
 * and `pouchMakingInForce` are each in one place.
 */

/**
 * A design nobody has specified yet.
 *
 * Two paths need it: a line added from scratch, and a line switched back to
 * "new design" after a saved job was picked. If those drifted apart, one of
 * them would leave the previous job's dimensions behind.
 */
export const BLANK_DESIGN = {
  jobName: '',
  widthMm: '',
  heightMm: '',
  isGazette: false,
  gazetteBottom: 0,
  gazetteLeft: 0,
  gazetteRight: 0,
  hasDPunch: false,
  hasVNotch: false,
  /*
   * Both plies start at nought.
   *
   * They used to open at 12 and 50 — a PET over a poly, which is the common
   * structure and so looked helpful. It was not: no film was chosen beside
   * either figure, so the line read as a 62µ laminate of nothing, the total
   * micron under it agreed, and the office had to notice that two numbers it
   * had not typed were already deciding a weight.
   *
   * Nought says what is true — nothing has been chosen yet — and choosing a
   * film fills the gauge in from the film's own name, which is where the
   * figure should come from. See `chooseFamily` in `LayerFields`: an empty box
   * is exactly the case it fills.
   */
  layers: [
    { materialId: null, micron: 0, rateOverride: '' },
    { materialId: null, micron: 0, rateOverride: '' },
  ],
  repeatWidth: 1,
  repeatHeight: 1,
  cylinderCount: 4,
  repairCylinders: false,
  repairs: [] as QuotationCylinderRepair[],
  cylinderManufacturer: '',
  cylinderDesign: '',
  /* Seeded with the four process colours once the rates list has loaded —
     see `JobCard`. Empty here because this constant cannot know them. */
  colours: [] as JobColour[],
  transportCost: 0,
  chargeCylinders: true,
  /* The works cuts its own sets unless the office says otherwise. */
  customerCylinders: false,
} as const;

export function setNumber(
  setValue: UseFormSetValue<CreateQuotationFormValues>,
  path: string,
  value: number | string,
) {
  setValue(path as never, String(value) as never, { shouldDirty: true });
}

/**
 * The saved job of this name, if the customer has one.
 *
 * Matched on the name rather than an id because the Customer step offers one
 * box that is both a list and somewhere to type: the office picks "Laxmi
 * Spices 250gm" or writes a name the works has never printed, and only the
 * text comes back either way. Trimmed and case-folded, since a name typed by
 * hand will not match one picked from a list otherwise.
 */
export function savedJobNamed(jobs: CustomerJob[], name: string): CustomerJob | null {
  const wanted = name.trim().toLowerCase();
  if (wanted === '') return null;
  return jobs.find((job) => job.jobName.trim().toLowerCase() === wanted) ?? null;
}

/**
 * The customer's designs as a list to drop down.
 *
 * A second line is attached only where the name does not tell two rows apart.
 * This works reuses design names across sizes and the jobs table carries a
 * code for each, so "Amol Bhadang 200gm." twice over is a real thing to pick
 * between and the code is the only way to do it. Where the name is unique the
 * code is noise, and a list where every row carries a grey line under it is
 * harder to read than one where a grey line means something.
 *
 * Typed structurally rather than as the Combobox's own option type, so this
 * file stays free of the component layer.
 */
export function jobOptions(
  jobs: CustomerJob[],
): { key: string; label: string; description?: string }[] {
  const seen = new Map<string, number>();
  for (const job of jobs) {
    const name = job.jobName.trim().toLowerCase();
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }

  return jobs.map((job) => {
    const ambiguous = (seen.get(job.jobName.trim().toLowerCase()) ?? 0) > 1;
    const code = job.jobCode?.trim();
    return {
      key: job.id,
      label: job.jobName,
      ...(ambiguous && code && code !== NOT_RECORDED ? { description: `Code ${code}` } : {}),
    };
  });
}

/** What the API writes where a customer record has nothing. */
const NOT_RECORDED = 'N/A';

/**
 * Copies a saved job's specification onto a line, or clears it for a new one.
 *
 * `null` starts clean. Leaving the previous job's name and dimensions behind
 * is how a new design gets saved under an existing job's name, which is far
 * harder to notice than an empty box.
 *
 * The quantities are left alone either way: what to charge is the office's
 * decision about this order, not part of the design being described.
 */
export function applySavedJob(
  setValue: UseFormSetValue<CreateQuotationFormValues>,
  index: number,
  job: CustomerJob | null,
  /**
   * What to call the line when there is no saved job.
   *
   * The Jobs step clears the name — "new design" there means start over. The
   * Customer step passes the name that was just typed, which is the whole
   * point of typing it.
   */
  nameWhenNew: string = BLANK_DESIGN.jobName,
): void {
  if (!job) {
    setValue(`items.${index}.jobId`, null, { shouldDirty: true });
    setValue(`items.${index}.jobName`, nameWhenNew, { shouldDirty: true });
    setValue(`items.${index}.chargeCylinders`, true, { shouldDirty: true });
    /* A new design is the works' to cut until somebody says the customer is
       bringing the set. Cleared with everything else, so the answer cannot
       outlive the design it was given about. */
    setValue(`items.${index}.customerCylinders`, false, { shouldDirty: true });
    setValue(
      `items.${index}.layers`,
      BLANK_DESIGN.layers.map((layer) => ({ ...layer })) as unknown as ItemValues['layers'],
      { shouldDirty: true },
    );
    for (const field of [
      'widthMm',
      'heightMm',
      'repeatWidth',
      'repeatHeight',
      'cylinderCount',
      'transportCost',
    ] as const) {
      setNumber(setValue, `items.${index}.${field}`, BLANK_DESIGN[field]);
    }
    return;
  }

  for (const [field, value] of Object.entries(designValues(job))) {
    setValue(`items.${index}.${field}` as never, value as never, { shouldDirty: true });
  }
}

/**
 * **A saved design as form values.**
 *
 * The specification and nothing else: the width, the height, the plies, how
 * many cylinders were cut, and that they were cut here already.
 *
 * One place, because two screens need the same rule in two shapes. The job
 * picker on the Customer step appends a whole line at once, and `applySavedJob`
 * writes the same fields onto a line that already exists. Written twice they
 * would drift, and a drift here is a design quoted at the wrong width.
 *
 * The quantities are not in it. What to charge is the office's decision about
 * this order, not part of the design being described.
 */
export function designValues(job: CustomerJob): Record<string, unknown> {
  /*
   * The jobs table keeps three fixed thicknesses — the printed ply, an optional
   * metallised one, and the sealant. The structure is rebuilt from whichever of
   * them the job has; the films themselves are left for the office to confirm,
   * because the job record never stored which was used.
   */
  const microns = [job.petMicron, job.metPetMicron, job.polyMicron]
    .map((value) => Number(value ?? 0))
    .filter((value) => value > 0);

  return {
    jobId: job.id,
    jobName: job.jobName,
    /* A repeat: this set is already in the works. Not a set the customer
       carried in — both charge nothing and the document says which. */
    chargeCylinders: false,
    customerCylinders: false,
    /* Strings, like every other number the form holds while it is being typed;
       the schema coerces them on the way in. */
    ...(job.designOpenWidth ? { widthMm: String(job.designOpenWidth) } : {}),
    ...(job.designHeight ? { heightMm: String(job.designHeight) } : {}),
    ...(job.totalCylinders ? { cylinderCount: String(job.totalCylinders) } : {}),
    ...(microns.length >= 2
      ? { layers: microns.map((micron) => ({ materialId: null, micron })) }
      : {}),
  };
}

/**
 * **Naming a line from a box that is both a list and somewhere to type.**
 *
 * The Customer step offers one control: a known customer's designs drop down,
 * and a name nobody has printed is typed over them. Only text comes back
 * either way, so what happens next is decided here.
 *
 * **The keystroke problem.** Clearing the line whenever the name is not a
 * saved one would wipe the width, the plies and the cylinder count letter by
 * letter as somebody typed a new name — the design would be destroyed by the
 * act of naming it. So the link is cleared ONCE, on the keystroke that leaves
 * a saved job behind, and after that only the name moves.
 */
export function nameJob(
  setValue: UseFormSetValue<CreateQuotationFormValues>,
  index: number,
  jobs: CustomerJob[],
  name: string,
  /** The saved job this line is currently linked to, if any. */
  linkedJobId: string | null,
  /**
   * The id of the design that was PICKED from the list, where one was.
   *
   * Typing gives us nothing but text, so the name has to be matched; a pick
   * gives us the row itself. Two of this works' designs share a name, and
   * matching the name would quietly apply the first of them to a line the
   * office had pointed at the second.
   */
  pickedId?: string | null,
): void {
  const job = pickedId
    ? (jobs.find((candidate) => candidate.id === pickedId) ?? null)
    : savedJobNamed(jobs, name);

  /* One of theirs: bring the whole design and mark it a repeat, exactly as
     the Jobs step's own picker does. */
  if (job) {
    if (job.id !== linkedJobId) applySavedJob(setValue, index, job);
    else setValue(`items.${index}.jobName`, name, { shouldDirty: true });
    return;
  }

  if (linkedJobId) applySavedJob(setValue, index, null, name);
  else setValue(`items.${index}.jobName`, name, { shouldDirty: true });
}
