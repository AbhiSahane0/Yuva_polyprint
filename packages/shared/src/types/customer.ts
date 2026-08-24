import type { CustomerSource } from '../schemas/customer.js';

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
