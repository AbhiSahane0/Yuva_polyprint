import { describe, expect, it, vi } from 'vitest';
import type { CustomerJob } from '@yuva/shared';
import { applySavedJob, nameJob, savedJobNamed } from './saved-job';

/**
 * **Naming the job on the first step, where the office already knows it.**
 *
 * One box that is both a list and somewhere to type: a known customer's
 * designs drop down, a name nobody has printed is typed over them. It writes
 * `items.0.jobName` — the Jobs step's own box — so the two cannot drift.
 */

const LAXMI = {
  id: 'job-laxmi',
  jobName: 'Laxmi Spices 250gm',
  designOpenWidth: 170,
  designHeight: 600,
  totalCylinders: 5,
  petMicron: 12,
  metPetMicron: null,
  polyMicron: 70,
} as unknown as CustomerJob;

const PAPAD = {
  id: 'job-papad',
  jobName: 'Papad Atta 1 Kg',
  designOpenWidth: 200,
  designHeight: 560,
  totalCylinders: 4,
  petMicron: 12,
  metPetMicron: 12,
  polyMicron: 75,
} as unknown as CustomerJob;

const JOBS = [LAXMI, PAPAD];

/** A setValue that records what was written, keyed by path. */
function recorder() {
  const written = new Map<string, unknown>();
  const setValue = vi.fn((path: string, value: unknown) => {
    written.set(path, value);
  });
  return { setValue: setValue as never, written };
}

describe('finding the saved job somebody typed', () => {
  it('matches a name picked from the list', () => {
    expect(savedJobNamed(JOBS, 'Laxmi Spices 250gm')?.id).toBe('job-laxmi');
  });

  /* A name typed by hand will not match one picked from a list otherwise. */
  it('ignores case and stray spaces', () => {
    expect(savedJobNamed(JOBS, '  laxmi SPICES 250gm ')?.id).toBe('job-laxmi');
  });

  it('finds nothing for a name the works has not printed', () => {
    expect(savedJobNamed(JOBS, 'Sagar Papad Masala 200g')).toBeNull();
  });

  it('finds nothing for an empty box', () => {
    expect(savedJobNamed(JOBS, '   ')).toBeNull();
  });
});

describe('picking one the works already prints', () => {
  it('brings the whole design, not just the name', () => {
    const { setValue, written } = recorder();
    nameJob(setValue, 0, JOBS, 'Laxmi Spices 250gm', null);

    expect(written.get('items.0.jobName')).toBe('Laxmi Spices 250gm');
    expect(written.get('items.0.jobId')).toBe('job-laxmi');
    expect(written.get('items.0.widthMm')).toBe('170');
    expect(written.get('items.0.heightMm')).toBe('600');
    expect(written.get('items.0.cylinderCount')).toBe('5');
    /* A repeat: the cylinders are already in the works. */
    expect(written.get('items.0.chargeCylinders')).toBe(false);
  });

  it('rebuilds the structure from the job’s own plies', () => {
    const { setValue, written } = recorder();
    nameJob(setValue, 0, JOBS, 'Papad Atta 1 Kg', null);
    /* Three plies on this one: PET, MET PET and the sealant. */
    expect(written.get('items.0.layers')).toEqual([
      { materialId: null, micron: 12 },
      { materialId: null, micron: 12 },
      { materialId: null, micron: 75 },
    ]);
  });

  it('does not re-apply a job that is already on the line', () => {
    const { setValue, written } = recorder();
    nameJob(setValue, 0, JOBS, 'Laxmi Spices 250gm', 'job-laxmi');
    /* Only the name moves — re-applying would undo anything the office had
       changed about the size since picking it. */
    expect(written.get('items.0.jobName')).toBe('Laxmi Spices 250gm');
    expect(written.has('items.0.widthMm')).toBe(false);
    expect(written.has('items.0.chargeCylinders')).toBe(false);
  });
});

describe('typing a name the works has not printed', () => {
  /*
   * **The one that would have destroyed the design.** Clearing the line
   * whenever the name is not a saved one wipes the width, the plies and the
   * cylinder count letter by letter as somebody types — the design destroyed
   * by the act of naming it.
   */
  it('clears the link once, then leaves the design alone', () => {
    /* Keystroke one, with a saved job still on the line. */
    const first = recorder();
    nameJob(first.setValue, 0, JOBS, 'S', 'job-laxmi');
    expect(first.written.get('items.0.jobId')).toBeNull();
    expect(first.written.get('items.0.chargeCylinders')).toBe(true);
    expect(first.written.get('items.0.jobName')).toBe('S');

    /* Every keystroke after it, with nothing linked. */
    for (const typed of ['Sa', 'Sag', 'Sagar Papad Masala 200g']) {
      const next = recorder();
      nameJob(next.setValue, 0, JOBS, typed, null);
      expect(next.written.get('items.0.jobName')).toBe(typed);
      expect(next.written.has('items.0.widthMm')).toBe(false);
      expect(next.written.has('items.0.layers')).toBe(false);
      expect(next.written.has('items.0.cylinderCount')).toBe(false);
    }
  });

  /* A new company has no saved jobs at all, so every name is a new one. */
  it('is all a new company ever does', () => {
    const { setValue, written } = recorder();
    nameJob(setValue, 0, [], 'Brand new pack', null);
    expect(written.get('items.0.jobName')).toBe('Brand new pack');
    expect(written.has('items.0.jobId')).toBe(false);
  });

  it('keeps the typed name when it clears a saved job', () => {
    /* Not the blank the Jobs step uses: the point of typing is the name. */
    const { setValue, written } = recorder();
    applySavedJob(setValue, 0, null, 'Something else');
    expect(written.get('items.0.jobName')).toBe('Something else');
    expect(written.get('items.0.widthMm')).toBe('');
  });

  it('still blanks the name when the Jobs step says “new design”', () => {
    const { setValue, written } = recorder();
    applySavedJob(setValue, 0, null);
    expect(written.get('items.0.jobName')).toBe('');
  });
});

describe('it is the Jobs step’s own box', () => {
  /*
   * Not a second field that copies across. Naming the job on the first step
   * writes `items.0.jobName`, which is what the Jobs step renders — so there
   * is no copy to keep in step and no way for the two to disagree.
   */
  it('writes into items.0, where the Jobs step reads', () => {
    const { setValue, written } = recorder();
    nameJob(setValue, 0, JOBS, 'Laxmi Spices 250gm', null);
    for (const path of written.keys()) {
      expect(path.startsWith('items.0.')).toBe(true);
    }
  });
});
