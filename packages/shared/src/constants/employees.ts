/**
 * The works' own people, at the level the floor needs them.
 *
 * Deliberately not a personnel system. There is no attendance here, no leave
 * calendar, no payroll: a works of forty does not run those off a screen, and a
 * screen that asks for them gets filled in once and then abandoned, which is
 * worse than not asking. What this holds is the handful of facts the rest of
 * the system needs to stop people being typed by hand — a name, what they do,
 * and when they are in.
 */

/** When somebody is normally in. */
export const SHIFTS = ['MORNING', 'AFTERNOON', 'NIGHT', 'GENERAL'] as const;
export type Shift = (typeof SHIFTS)[number];

export const SHIFT_LABELS: Record<Shift, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  NIGHT: 'Night',
  /** Office hours — the people who are not on a shift rota at all. */
  GENERAL: 'General',
};

/**
 * What somebody is doing, as the list reads it.
 *
 * **Derived, never stored.** A status somebody has to remember to change is
 * wrong most of the time — the same reason a job card's progress and an order's
 * lateness are worked out rather than kept. WORKING means a job card stage is
 * running with their name on it, and nothing else can make it true.
 */
export const EMPLOYEE_ACTIVITIES = ['WORKING', 'AVAILABLE', 'LEFT'] as const;
export type EmployeeActivity = (typeof EMPLOYEE_ACTIVITIES)[number];

export const EMPLOYEE_ACTIVITY_LABELS: Record<EmployeeActivity, string> = {
  WORKING: 'Working',
  AVAILABLE: 'Available',
  LEFT: 'Left',
};
