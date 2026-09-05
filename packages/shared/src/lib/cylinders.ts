/**
 * What an event does to a cylinder, and what a set of them says about a design.
 *
 * The rule worth stating: **a cylinder's status is a fact about its last event,
 * not a flag somebody sets.** A cylinder marked "in store" by hand while it is
 * actually on a machine is exactly the one nobody can find, and that is the
 * failure this module exists to prevent.
 */

export const CYLINDER_STATUSES = [
  'IN_STORE',
  'ALLOCATED',
  'IN_USE',
  'DAMAGED',
  'NEEDS_REWORK',
  'RETIRED',
] as const;
export type CylinderStatus = (typeof CYLINDER_STATUSES)[number];

export const CYLINDER_EVENT_KINDS = [
  'ENGRAVED',
  'ALLOCATED',
  'IN_USE',
  'RETURNED',
  'DAMAGED',
  'REWORKED',
  'TRANSFERRED',
  'RETIRED',
] as const;
export type CylinderEventKind = (typeof CYLINDER_EVENT_KINDS)[number];

export const CYLINDER_OWNERSHIPS = ['CUSTOMER_OWNED', 'YUVA_OWNED'] as const;
export type CylinderOwnership = (typeof CYLINDER_OWNERSHIPS)[number];

export const CYLINDER_STATUS_LABELS: Record<CylinderStatus, string> = {
  IN_STORE: 'In store',
  ALLOCATED: 'Allocated',
  IN_USE: 'In use',
  DAMAGED: 'Damaged',
  NEEDS_REWORK: 'Needs rework',
  RETIRED: 'Retired',
};

export const CYLINDER_EVENT_LABELS: Record<CylinderEventKind, string> = {
  ENGRAVED: 'Engraved',
  ALLOCATED: 'Allocated',
  IN_USE: 'In use',
  RETURNED: 'Returned to store',
  DAMAGED: 'Damaged',
  REWORKED: 'Reworked',
  TRANSFERRED: 'Transferred',
  RETIRED: 'Retired',
};

export const OWNERSHIP_LABELS: Record<CylinderOwnership, string> = {
  CUSTOMER_OWNED: 'Customer-owned',
  YUVA_OWNED: 'Yuva-owned',
};

/**
 * The status an event leaves a cylinder in.
 *
 * `TRANSFERRED` is the one that returns null: moving a cylinder between shelves
 * changes where it is, not what it is doing. A set mounted on a machine and
 * carried to another store is still in use.
 */
export function statusAfter(kind: CylinderEventKind, current: CylinderStatus): CylinderStatus {
  switch (kind) {
    case 'ENGRAVED':
    case 'RETURNED':
    case 'REWORKED':
      return 'IN_STORE';
    case 'ALLOCATED':
      return 'ALLOCATED';
    case 'IN_USE':
      return 'IN_USE';
    case 'DAMAGED':
      return 'DAMAGED';
    case 'RETIRED':
      return 'RETIRED';
    case 'TRANSFERRED':
      return current;
  }
}

/**
 * Whether an event makes sense given where the cylinder is now.
 *
 * Deliberately permissive: the works does not always record things in order,
 * and refusing a late entry would mean the history stays wrong rather than
 * being corrected. Only the genuinely impossible is refused — a retired
 * cylinder cannot be mounted, because it is not there.
 */
export function canRecord(kind: CylinderEventKind, current: CylinderStatus): boolean {
  if (current !== 'RETIRED') return true;
  // A retired cylinder can only be brought back by re-engraving it.
  return kind === 'REWORKED' || kind === 'ENGRAVED';
}

/**
 * Statuses that mean the cylinder cannot be used as it stands.
 *
 * Named for cylinders rather than the generic `needsAttention` that stock uses:
 * both are exported from the same package, and two functions with one name
 * would resolve to whichever was imported last.
 */
export function isUnusable(status: CylinderStatus): boolean {
  return status === 'DAMAGED' || status === 'NEEDS_REWORK';
}

/** Statuses that mean it is off the shelf. */
export function isOutOfStore(status: CylinderStatus): boolean {
  return status === 'ALLOCATED' || status === 'IN_USE';
}

/**
 * How a whole design reads, from the state of its cylinders.
 *
 * The worst state wins, because that is the one somebody has to do something
 * about. A design with five good cylinders and one damaged one cannot be
 * printed, and reporting it as active would be a lie of omission.
 */
export function designStatus(statuses: CylinderStatus[]): CylinderStatus | 'NONE' {
  if (statuses.length === 0) return 'NONE';
  const order: CylinderStatus[] = [
    'DAMAGED',
    'NEEDS_REWORK',
    'RETIRED',
    'IN_USE',
    'ALLOCATED',
    'IN_STORE',
  ];
  // Retired is only the design's state when every one of them is.
  if (statuses.every((status) => status === 'RETIRED')) return 'RETIRED';
  return order.find((status) => statuses.includes(status)) ?? 'IN_STORE';
}
