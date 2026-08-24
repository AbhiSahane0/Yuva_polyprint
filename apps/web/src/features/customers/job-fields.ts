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
  kind?: 'text' | 'number' | 'select' | 'textarea';
  options?: readonly string[];
  placeholder?: string;
  required?: boolean;
  /** Columns out of 12 on desktop. Defaults to 3. */
  span?: 3 | 4 | 6 | 12;
}

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
      { name: 'jobCode', label: 'Job code', placeholder: 'YPP2605001', span: 3 },
      {
        name: 'jobName',
        label: 'Job name',
        placeholder: 'e.g. Maharaja Atta 5kg.',
        required: true,
        span: 6,
      },
      { name: 'jobType', label: 'Form', kind: 'select', options: JOB_TYPES, span: 3 },
      { name: 'pouchType', label: 'Pouch type', placeholder: 'Center & Top Seal', span: 6 },
      { name: 'pouchSubType', label: 'Pouch style', placeholder: 'Standy Zipper', span: 6 },
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
      { name: 'polyType', label: 'Poly type', placeholder: 'White LDPE', span: 4 },
      {
        name: 'printingType',
        label: 'Printing type',
        placeholder: 'Reverse Printing',
        span: 4,
      },
      {
        name: 'jobFinalDirection',
        label: 'Final direction',
        hint: 'Readable or Unreadable',
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
      { name: 'design', label: 'Design name', placeholder: 'Atta 5kg.', span: 4 },
      { name: 'jobColours', label: 'Colours', placeholder: 'CMYK & Brown', span: 4 },
      { name: 'cylinderParty', label: 'Cylinder supplier', placeholder: 'Shilp Gravures', span: 4 },
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
      { name: 'compositeGsm', label: 'Composite (total)', kind: 'number', span: 4 },
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
      { name: 'pouchesPerKg', label: 'Pouches per kg', placeholder: '31.97', span: 4 },
    ],
  },
  {
    title: 'Pouch dimensions',
    description: 'Finished pouch size and any punch, gusset or notch.',
    fields: [
      { name: 'pouchHeight', label: 'Pouch height', hint: 'mm', kind: 'number', span: 3 },
      { name: 'pouchOpenWidth', label: 'Pouch open width', hint: 'mm', kind: 'number', span: 3 },
      { name: 'dPunch', label: 'D punch', hint: 'Yes / No / size', span: 3 },
      { name: 'dPunchTopSize', label: 'D punch top size', span: 3 },
      { name: 'gusset', label: 'Gusset', hint: 'Yes / No', span: 4 },
      { name: 'gussetSize', label: 'Gusset size', span: 4 },
      { name: 'vNotch', label: 'V notch', hint: 'Yes / No', span: 4 },
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
