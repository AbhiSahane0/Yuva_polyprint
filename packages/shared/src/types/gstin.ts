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

  /**
   * As registered — which for a proprietorship is a **person's name**, not the
   * business's. Yuva's own GSTIN returns "ANAND KISAN HASE" here and
   * "YUVA POLYPRINT AND PACKAGING INDUSTRIES" as the trade name.
   *
   * This is the name a GST invoice must carry. It is not the name the office
   * knows a customer by, so it is not what prefills the company name.
   */
  legalName: string | null;
  /** What they trade as. For most customers this is the name to use. */
  tradeName: string | null;

  /** Active, Cancelled, Suspended, Provisional. */
  status: string | null;
  /** Regular, Composition, Casual, and so on. */
  taxpayerType: string | null;
  /** Proprietorship, Private Limited Company, Partnership… */
  constitution: string | null;
  /** ISO date. */
  registrationDate: string | null;
  /** Set only when the registration has been cancelled. */
  cancellationDate: string | null;
  /**
   * E-way-bill blocking — "Blocked" / "Unblocked". Separate from status: a
   * registration can be Active and still blocked for non-filing, which stops
   * e-way bills being raised against it.
   */
  blockStatus: string | null;

  /** Principal place of business, split so it can fill the customer form. */
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;

  natureOfBusiness: string[];
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
