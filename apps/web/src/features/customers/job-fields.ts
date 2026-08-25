import { JOB_TYPES, type CustomerJobFormValues } from '@yuva/shared';

/**
 * The job specification, described as data rather than 45 hand-written blocks
 * of JSX. Grouping and plain-English labels are what make this editable by
 * someone who has never seen the database — the sheet's own headers
 * ("Pet µ", "Adh. GSM", "D Punch") mean nothing on their own.
 */
export interface JobFieldDef {
  name: Exclude<keyof CustomerJobFormValues, 'id'>;
  label: string;
  hint?: string;
  /**
   * `select`   — a closed set; nothing else is valid.
   * `datalist` — suggestions, but anything can still be typed. Used where the
   *              imported data has a handful of common values plus a long tail,
   *              so people stop inventing new spellings of the same thing
   *              without being blocked from entering something genuinely new.
   */
  kind?: 'text' | 'number' | 'select' | 'datalist' | 'textarea';
  options?: readonly string[];
  placeholder?: string;
  required?: boolean;
  /** Columns out of 12 on desktop. Defaults to 3. */
  span?: 3 | 4 | 6 | 12;
}

/** Plain yes/no. Anything else in these columns was a mistake. */
const YES_NO = ['Yes', 'No'] as const;

/**
 * Values already in the imported data, canonicalised. "White LDPE" and
 * "White Ldpe" are the same film typed two ways (54 and 46 rows); offering one
 * spelling stops the split getting worse.
 */
const POLY_TYPES = [
  'Nat Metlocene',
  'W/O Metlocene',
  'Natural LDPE',
  'White LDPE',
  'Natural GP',
  'Pearl BOPP',
] as const;

const POUCH_TYPES = [
  'Center & Top Seal',
  'Top & Side Seal',
  'Side & Top Seal',
  'Bottom & Side Seal',
  'Three Side Seal',
  'Side Seal',
  'Standy Zipper Pouch',
] as const;

const PRINTING_TYPES = ['Reverse Printing', 'Surface Printing', 'Blank'] as const;

const CYLINDER_SUPPLIERS = [
  'Shilp Gravures',
  'Techno Plast',
  'Techno Engineering',
  'Afflatus Gravures',
] as const;

const JOB_COLOURS = ['CMYK', 'CMYK & White', 'CMYK & Brown', 'CMYK & Red'] as const;

export interface JobFieldGroup {
  title: string;
  description?: string;
  fields: JobFieldDef[];
  /** Groups that stay closed until asked for. */
  collapsedByDefault?: boolean;
}

export const JOB_FIELD_GROUPS: JobFieldGroup[] = [
  {
    title: 'Basics',
    description: 'What the job is called and the form it is produced in.',
    fields: [
      {
        name: 'jobName',
        label: 'Job name',
        placeholder: 'e.g. Maharaja Atta 5kg.',
        required: true,
        span: 6,
      },
      { name: 'jobType', label: 'Form', kind: 'select', options: JOB_TYPES, span: 3 },
      {
        name: 'pouchType',
        label: 'Pouch type',
        kind: 'datalist',
        options: POUCH_TYPES,
        placeholder: 'Choose or type',
        span: 6,
      },
      { name: 'pouchSubType', label: 'Pouch style', placeholder: 'e.g. Standy Zipper', span: 6 },
    ],
  },
  {
    title: 'Film structure',
    description: 'The layers the job is made from, in microns (µ).',
    fields: [
      { name: 'petMicron', label: 'PET', hint: 'microns', kind: 'number', span: 3 },
      { name: 'metPetMicron', label: 'Metallised PET', hint: 'microns', kind: 'number', span: 3 },
      { name: 'polyMicron', label: 'Poly', hint: 'microns', kind: 'number', span: 3 },
      { name: 'layer', label: 'Number of layers', kind: 'number', span: 3 },
      {
        name: 'polyType',
        label: 'Poly type',
        kind: 'datalist',
        options: POLY_TYPES,
        placeholder: 'Choose or type',
        span: 4,
      },
      {
        name: 'printingType',
        label: 'Printing type',
        kind: 'datalist',
        options: PRINTING_TYPES,
        placeholder: 'Choose or type',
        span: 4,
      },
      {
        name: 'jobFinalDirection',
        label: 'Final direction',
        kind: 'select',
        options: ['Readable', 'Unreadable'],
        span: 4,
      },
    ],
  },
  {
    title: 'Design & cylinders',
    description: 'Artwork size and the engraved cylinder set it prints from.',
    fields: [
      { name: 'designHeight', label: 'Design height', hint: 'mm', kind: 'number', span: 3 },
      { name: 'designOpenWidth', label: 'Design open width', hint: 'mm', kind: 'number', span: 3 },
      { name: 'ups', label: 'Ups', hint: 'Impressions across', kind: 'number', span: 3 },
      { name: 'totalCylinders', label: 'Total cylinders', kind: 'number', span: 3 },
      { name: 'design', label: 'Design name', placeholder: 'e.g. Atta 5kg.', span: 4 },
      {
        name: 'jobColours',
        label: 'Colours',
        kind: 'datalist',
        options: JOB_COLOURS,
        placeholder: 'Choose or type',
        span: 4,
      },
      {
        name: 'cylinderParty',
        label: 'Cylinder supplier',
        kind: 'datalist',
        options: CYLINDER_SUPPLIERS,
        placeholder: 'Choose or type',
        span: 4,
      },
    ],
  },
  {
    title: 'Coating weights (GSM)',
    description: 'Grams per square metre for each layer. Composite is the total.',
    fields: [
      { name: 'inkGsm', label: 'Ink', kind: 'number', span: 3 },
      { name: 'petGsm', label: 'PET', kind: 'number', span: 3 },
      { name: 'metPetGsm', label: 'Metallised PET', kind: 'number', span: 3 },
      { name: 'polyGsm', label: 'Poly', kind: 'number', span: 3 },
      { name: 'adhesiveGsm', label: 'Adhesive', kind: 'number', span: 4 },
      { name: 'coatingGsm', label: 'Coating', kind: 'number', span: 4 },
    ],
  },
  {
    title: 'Machine & tooling',
    description: 'Some of these are recorded as ranges, e.g. 15-16, so text is allowed.',
    fields: [
      { name: 'rubberSize', label: 'Rubber size', kind: 'number', span: 3 },
      { name: 'cylinderCell', label: 'Cylinder cell', kind: 'number', span: 3 },
      { name: 'cylinderDia', label: 'Cylinder dia / repeat', kind: 'number', span: 3 },
      { name: 'viscosity', label: 'Viscosity', placeholder: '15-16', span: 3 },
      { name: 'pouchPlateSize', label: 'Pouch plate size', placeholder: '315', span: 4 },
      { name: 'singleRollWeight', label: 'Single roll weight', placeholder: '60-70', span: 4 },
    ],
  },
  {
    title: 'Pouch dimensions',
    description: 'Finished pouch size and any punch, gusset or notch.',
    fields: [
      { name: 'pouchHeight', label: 'Pouch height', hint: 'mm', kind: 'number', span: 3 },
      { name: 'pouchOpenWidth', label: 'Pouch open width', hint: 'mm', kind: 'number', span: 3 },
      { name: 'dPunch', label: 'D punch', kind: 'select', options: YES_NO, span: 3 },
      { name: 'dPunchTopSize', label: 'D punch top size', hint: 'mm', span: 3 },
      { name: 'gusset', label: 'Gusset', kind: 'select', options: YES_NO, span: 4 },
      { name: 'gussetSize', label: 'Gusset size', hint: 'mm', span: 4 },
      { name: 'vNotch', label: 'V notch', kind: 'select', options: YES_NO, span: 4 },
    ],
  },
  {
    title: 'Other details',
    description: 'Extra columns carried over from the spreadsheet. Rarely needed.',
    collapsedByDefault: true,
    fields: [
      { name: 'up1', label: 'Up 1', span: 3 },
      { name: 'up2', label: 'Up 2', span: 3 },
      { name: 'up3', label: 'Up 3', span: 3 },
      { name: 'up4', label: 'Up 4', span: 3 },
      { name: 'up2OpenWidth', label: 'Up 2 open width', span: 4 },
      { name: 'up2Height', label: 'Up 2 height', span: 4 },
      { name: 'up3OpenWidth', label: 'Up 3 open width', span: 4 },
      { name: 'notes', label: 'Notes', kind: 'textarea', span: 12 },
    ],
  },
];

export const SPAN_CLASS: Record<NonNullable<JobFieldDef['span']>, string> = {
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
  6: 'sm:col-span-6',
  12: 'sm:col-span-12',
};
