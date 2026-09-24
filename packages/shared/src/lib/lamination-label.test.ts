import { describe, expect, it } from 'vitest';
import { laminationLabel } from './lamination-label.js';

const threePly = ['PET 12µm', 'MET PET 12µm', 'LDPE Milky / Natural'];
const twoPly = ['PET 12µm', 'LDPE Milky / Natural'];

describe('what a lamination row is called', () => {
  it('does not number a job with only one pass', () => {
    /*
     * "Lamination 1" on a job with a single bond is what made the works read
     * the number as a machine — they have two laminators and one was being
     * offered a number.
     */
    expect(laminationLabel({ pass: 1, totalPasses: 1, plies: twoPly })).toEqual({
      title: 'Lamination',
      bonds: 'PET 12µm + LDPE Milky / Natural',
    });
  });

  it('names the two films the first pass bonds', () => {
    expect(laminationLabel({ pass: 1, totalPasses: 2, plies: threePly })).toEqual({
      title: 'Lamination 1',
      bonds: 'PET 12µm + MET PET 12µm',
    });
  });

  it('reads the second pass as an addition, because that is what it is', () => {
    /*
     * The second pass does not bond two fresh films. It bonds what came off
     * the machine to the next ply down, and writing it as "MET PET + LDPE"
     * would say the PET was not there.
     */
    expect(laminationLabel({ pass: 2, totalPasses: 2, plies: threePly })).toEqual({
      title: 'Lamination 2',
      bonds: '+ LDPE Milky / Natural',
    });
  });

  it('handles a four-ply structure, which is three passes', () => {
    const fourPly = [...threePly, 'PE 60µm'];
    expect(laminationLabel({ pass: 3, totalPasses: 3, plies: fourPly }).bonds).toBe('+ PE 60µm');
  });

  it('gives the number and no films when the structure is not known', () => {
    /*
     * A card on an order typed over the phone. A guess at which films are on
     * the machine is worse than saying nothing.
     */
    expect(laminationLabel({ pass: 1, totalPasses: 2, plies: [] })).toEqual({
      title: 'Lamination 1',
      bonds: '',
    });
    expect(laminationLabel({ pass: 2, totalPasses: 2, plies: twoPly }).bonds).toBe('');
  });
});
