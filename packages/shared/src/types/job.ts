/**
 * A **design** — the customer's product, as the works knows it.
 *
 * "Job" is the works' own word and the column heading on their sheets, so it
 * is what the database calls it. On screen it reads as a design, because that
 * is what somebody is looking for when they go hunting: the artwork and the
 * structure, not the run.
 */
export interface DesignMasterRow {
  id: string;
  jobCode: string;
  jobName: string;
  jobType: string;

  customerId: string | null;
  customerName: string | null;
  /**
   * Nobody could work out whose it was when it came off the old sheets.
   * These are the ones that cannot be found any other way: they belong to no
   * customer, so no customer's page lists them.
   */
  needsCustomer: boolean;

  /** What it is made of, in the shortest form that is still true. */
  structure: string;
  colours: string;

  /* What has happened to it. All counted, never stored. */
  quotedTimes: number;
  orderedTimes: number;
  hasCylinders: boolean;
  hasArtwork: boolean;
  /** The last time anybody priced it. Null if never. */
  lastQuotedOn: string | null;
}

export interface DesignMasterTotals {
  designs: number;
  /** The worklist: designs with nobody's name against them. */
  needCustomer: number;
  everQuoted: number;
  withCylinders: number;
}

/**
 * `DesignMaster…` rather than `Design…` because Design & Cylinders already
 * owns those names for a cylinder set. Two different things: that module asks
 * which designs have been engraved, this one is the list of designs itself.
 */
export interface DesignMasterList {
  items: DesignMasterRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: DesignMasterTotals;
}

/**
 * **A design, as the job card reads it.**
 *
 * Everything on the works' Job Sheet that is not typed by the operator comes
 * from here — which is their Jobs Data tab, and the columns line up one for
 * one because the design master was built from that sheet.
 *
 * It is deliberately wider than `JobCardDesign`, which carries only what the
 * arithmetic needs. The rest is what the card PRINTS: the poly's name, the
 * direction the job is read in, the viscosities the laminator sets, the pouch
 * it ends up as. Numbers the works keeps as ranges — "15-16", "13-14" — stay
 * strings, because that is what the works wrote and a midpoint would be an
 * invention.
 */
export interface JobSpecification {
  id: string;
  jobCode: string;
  jobName: string;
  jobType: string;
  customerName: string | null;

  /* ---- structure, and what the card weighs it at ---- */
  petMicron: number;
  metPetMicron: number;
  polyMicron: number;
  polyType: string;
  petGsm: number;
  metPetGsm: number;
  polyGsm: number;
  compositeGsm: number;
  layer: number;

  /* ---- printing ---- */
  jobColours: string;
  totalCylinders: number;
  printingType: string;
  jobFinalDirection: string;
  ups: number;

  /* ---- tooling. The card calls these the cylinder size and its circumference. ---- */
  rubberSizeMm: number;
  cylinderCellMm: number;
  cylinderDiaMm: number;
  pouchPlateSize: string;
  viscosity: string;

  /* ---- slitting ---- */
  singleRollWidthMm: number;
  singleRollWeight: string;

  /* ---- what it becomes ---- */
  pouchSubType: string;
  pouchHeightMm: number;
  pouchOpenWidthMm: number;
  pouchesPerKg: number;
  dPunchTopSize: string;
  gusset: string;
  gussetSize: string;
  vNotch: string;
}
