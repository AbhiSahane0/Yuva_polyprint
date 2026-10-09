import type { CustomerSource } from '../schemas/customer.js';

/** A job and its full specification, as returned against its customer. */
export interface CustomerJob {
  id: string;
  jobCode: string;
  jobName: string;
  jobType: string;
  pouchType: string;
  pouchSubType: string;

  petMicron: string | null;
  metPetMicron: string | null;
  polyMicron: string | null;
  polyType: string;
  layer: string | null;
  jobFinalDirection: string;
  printingType: string;

  designHeight: string | null;
  designOpenWidth: string | null;
  ups: string | null;
  design: string;
  jobColours: string;
  totalCylinders: string | null;
  cylinderParty: string;

  inkGsm: string | null;
  petGsm: string | null;
  metPetGsm: string | null;
  polyGsm: string | null;
  adhesiveGsm: string | null;
  compositeGsm: string | null;
  coatingGsm: string | null;

  rubberSize: string | null;
  cylinderCell: string | null;
  cylinderDia: string | null;
  viscosity: string;
  pouchPlateSize: string;
  singleRollWeight: string;
  /** True where the customer settles the roll weight, not the works. */
  confirmRollWeight: boolean;
  pouchesPerKg: string;

  pouchHeight: string | null;
  pouchOpenWidth: string | null;
  dPunch: string;
  dPunchTopSize: string;
  gusset: string;
  gussetSize: string;
  vNotch: string;

  up1: string;
  up2: string;
  up3: string;
  up4: string;
  up2OpenWidth: string;
  up2Height: string;
  up3OpenWidth: string;
  notes: string;
}

/** A customer as returned by the API. */
export interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  address: string;
  city: string;
  district: string;
  pincode: string;
  mobile: string;
  gstNumber: string;
  altPhone: string;
  email: string;
  /** The original spreadsheet text this record was parsed from. */
  sourceRaw: string;
  isVerified: boolean;
  source: CustomerSource;
  /** How many jobs reference this customer. */
  jobCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A single customer with their jobs — returned by GET /customers/:id. */
export interface CustomerDetail extends Customer {
  jobs: CustomerJob[];
}
