import { describe, expect, it } from 'vitest';
import { micronFromFilmName } from './material-cost.js';

/**
 * Read against the real rates master, not invented names — these are the
 * eleven films the works actually buys.
 */
describe('micronFromFilmName', () => {
  it('reads the gauge off every film in the rates master', () => {
    expect(micronFromFilmName('PET 12µm')).toBe(12);
    expect(micronFromFilmName('PET 19µm')).toBe(19);
    expect(micronFromFilmName('MET PET 12µm')).toBe(12);
    expect(micronFromFilmName('PE 50µm')).toBe(50);
    expect(micronFromFilmName('PE 60µm')).toBe(60);
    expect(micronFromFilmName('LDPE 60µm')).toBe(60);
    expect(micronFromFilmName('BOPP 20µm')).toBe(20);
    expect(micronFromFilmName('Foil 7µm')).toBe(7);
    expect(micronFromFilmName('POF 40µm')).toBe(40);
  });

  it('reads a gauge that sits after other words', () => {
    expect(micronFromFilmName('PVC / PETG 45µm')).toBe(45);
  });

  it('accepts the unit spelled out, and a fractional gauge', () => {
    expect(micronFromFilmName('PET 12 micron')).toBe(12);
    expect(micronFromFilmName('Foil 6.5µm')).toBe(6.5);
  });

  it('returns null when the name states no gauge', () => {
    // A real material: woven polypropylene is specified by GSM, not thickness.
    expect(micronFromFilmName('PP Woven')).toBeNull();
    expect(micronFromFilmName('')).toBeNull();
    // A bare number is not a gauge — the unit has to be there.
    expect(micronFromFilmName('PET 12')).toBeNull();
  });
});
