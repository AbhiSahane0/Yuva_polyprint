/**
 * What a GSTIN lookup returns.
 *
 * Every field except the GSTIN itself is nullable, because the registry
 * genuinely leaves some of them empty — a proprietorship often has no trade
 * name distinct from its legal one — and because it insulates us from a
 * provider that names a field differently. A missing field shows as missing;
 * it never crashes the form or, worse, prefills an empty string over something
 * the office already typed.
 */
export interface GstinLookup {
  gstin: string;

  /** As registered. This is the name that belongs on an invoice. */
  legalName: string | null;
  /** What they trade as, where that differs. */
  tradeName: string | null;

  /** Active, Cancelled, Suspended, Provisional. */
  status: string | null;
  /** Regular, Composition, Casual, and so on. */
  taxpayerType: string | null;
  /** Proprietorship, Private Limited Company, Partnership… */
  constitution: string | null;
  /** ISO date. */
  registrationDate: string | null;

  /** Principal place of business, split so it can fill the customer form. */
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;

  natureOfBusiness: string[];
  centreJurisdiction: string | null;
  stateJurisdiction: string | null;

  /**
   * When the registry was actually asked — not when this response was served.
   *
   * The distinction matters for `status` and nothing else. A legal name does
   * not go stale; a registration being cancelled does, and a quotation raised
   * against a six-month-old "Active" is a different thing from one raised
   * against an "Active" checked this morning.
   */
  checkedAt: string;
  /** True when this came from our cache rather than from a fresh credit. */
  fromCache: boolean;
}
