import { describe, expect, it } from 'vitest';
import type { CustomerDetail, CustomerJob } from '@yuva/shared';
import {
  baselineFromCustomer,
  changedCustomerFields,
  designFingerprint,
  fingerprintFromSavedJob,
  isSaveableDesign,
  jobPayloadFromLine,
  normalise,
  type LineForJob,
} from './step-save';

const customer = {
  companyName: 'ADF Foods Ltd',
  address: 'MIDC Malegaon',
  city: 'Sangamner',
  district: 'NA',
  mobile: '9876543210',
  email: 'NA',
  gstNumber: '27AIGPH5992Q1ZD',
} as unknown as CustomerDetail;

describe('deciding whether the customer needs writing', () => {
  it('says nothing changed when nothing was touched', () => {
    const baseline = baselineFromCustomer(customer);
    // What the form shows: 'NA' is rendered as an empty box.
    const current = { ...baseline };
    expect(changedCustomerFields(baseline, current)).toBeNull();
  });

  it("does not mistake the importer's NA placeholder for an edit", () => {
    // The bug this exists to prevent: district and email are 'NA' on the record
    // and blank on the form, so a naive diff would write on every quotation.
    const baseline = baselineFromCustomer(customer);
    expect(baseline.district).toBe('');
    expect(baseline.email).toBe('');

    const current = { ...baseline, district: '', email: '' };
    expect(changedCustomerFields(baseline, current)).toBeNull();
  });

  it('ignores whitespace-only differences', () => {
    const baseline = baselineFromCustomer(customer);
    expect(changedCustomerFields(baseline, { ...baseline, city: '  Sangamner  ' })).toBeNull();
  });

  it('sends only the fields that moved', () => {
    const baseline = baselineFromCustomer(customer);
    const changed = changedCustomerFields(baseline, { ...baseline, mobile: '9000000000' });

    // Not the whole customer — a colleague's edit to another field survives.
    expect(changed).toEqual({ mobile: '9000000000' });
  });

  it('treats deliberately clearing a field as a change', () => {
    const baseline = baselineFromCustomer(customer);
    expect(changedCustomerFields(baseline, { ...baseline, mobile: '' })).toEqual({ mobile: '' });
  });

  it('normalises NA and blanks identically', () => {
    expect(normalise('NA')).toBe('');
    expect(normalise('  ')).toBe('');
    expect(normalise(null)).toBe('');
    expect(normalise(' Sangamner ')).toBe('Sangamner');
  });
});

const line: LineForJob = {
  jobName: 'ADF Plain 200g.',
  jobKind: 'POUCH',
  pouchType: 'Standup',
  widthMm: 250,
  heightMm: 205,
  cylinderCount: 4,
  microns: [12, 60],
  pouchesPerKg: 239.71,
};

describe('deciding whether a design needs writing', () => {
  it('maps plies onto the three slots the jobs table has', () => {
    const payload = jobPayloadFromLine(line);
    expect(payload.petMicron).toBe(12);
    expect(payload.metPetMicron).toBeNull();
    expect(payload.polyMicron).toBe(60);
    expect(payload.layer).toBe(2);
  });

  it('puts the middle ply in the metallised slot on a three-ply line', () => {
    const payload = jobPayloadFromLine({ ...line, microns: [12, 12, 60] });
    expect(payload.petMicron).toBe(12);
    expect(payload.metPetMicron).toBe(12);
    expect(payload.polyMicron).toBe(60);
    expect(payload.layer).toBe(3);
  });

  it('recognises a design that has not moved since it was loaded', () => {
    const job = {
      id: 'j1',
      jobName: 'ADF Plain 200g.',
      pouchType: 'Standup',
      petMicron: 12,
      metPetMicron: null,
      polyMicron: 60,
      designOpenWidth: 250,
      designHeight: 205,
      totalCylinders: 4,
    } as unknown as CustomerJob;

    // Same design, so nothing is sent when the office steps past it.
    expect(designFingerprint(jobPayloadFromLine(line))).toBe(fingerprintFromSavedJob(job));
  });

  it('notices a real edit', () => {
    const before = designFingerprint(jobPayloadFromLine(line));
    expect(designFingerprint(jobPayloadFromLine({ ...line, heightMm: 210 }))).not.toBe(before);
    expect(designFingerprint(jobPayloadFromLine({ ...line, microns: [12, 70] }))).not.toBe(before);
    expect(designFingerprint(jobPayloadFromLine({ ...line, cylinderCount: 6 }))).not.toBe(before);
  });

  it('does not treat a rename in case alone as an edit', () => {
    const before = designFingerprint(jobPayloadFromLine(line));
    expect(designFingerprint(jobPayloadFromLine({ ...line, jobName: 'adf plain 200g.' }))).toBe(
      before,
    );
  });
});

describe('a line that is not yet a design', () => {
  it('is not saved', () => {
    // Half-typed lines would leave the customer holding rows to hunt down.
    expect(isSaveableDesign({ ...line, jobName: '   ' })).toBe(false);
    expect(isSaveableDesign({ ...line, widthMm: 0 })).toBe(false);
    expect(isSaveableDesign({ ...line, heightMm: 0 })).toBe(false);
  });

  it('but a complete one is', () => {
    expect(isSaveableDesign(line)).toBe(true);
  });
});

describe('a design read back from the server', () => {
  /*
   * Both of these were found by watching the wizard against a real database,
   * not by reading the code. The jobs table stores measurements as Prisma
   * Decimals, which JSON-serialise as strings — so the fingerprint compared
   * "12" against 12, every design looked edited, and stepping past a saved job
   * issued a PATCH every single time.
   */
  it('matches the form even though the API returns decimals as strings', () => {
    const fromApi = {
      id: 'j1',
      jobName: 'Progressive Save Probe',
      pouchType: 'STANDUP',
      petMicron: '12',
      metPetMicron: null,
      polyMicron: '60',
      designOpenWidth: '300',
      designHeight: '200',
      totalCylinders: '4',
    } as unknown as CustomerJob;

    const onScreen: LineForJob = {
      jobName: 'Progressive Save Probe',
      jobKind: 'POUCH',
      pouchType: 'STANDUP',
      widthMm: 300,
      heightMm: 200,
      cylinderCount: 4,
      microns: [12, 60],
      pouchesPerKg: 204.75,
    };

    expect(fingerprintFromSavedJob(fromApi)).toBe(designFingerprint(jobPayloadFromLine(onScreen)));
  });

  it('treats a zero metallised ply and an absent one as the same', () => {
    // The imported sheet writes 0 into the middle slot for two-ply jobs.
    const zero = { petMicron: '12', metPetMicron: '0', polyMicron: '60' };
    const absent = { petMicron: '12', metPetMicron: null, polyMicron: '60' };
    const rest = {
      id: 'j1',
      jobName: 'ADF Plain 200g.',
      pouchType: 'NA',
      designOpenWidth: '250',
      designHeight: '205',
      totalCylinders: '8',
    };

    expect(fingerprintFromSavedJob({ ...rest, ...zero } as unknown as CustomerJob)).toBe(
      fingerprintFromSavedJob({ ...rest, ...absent } as unknown as CustomerJob),
    );
  });
});

describe('the brand, as a customer detail', () => {
  it('is written back when the office corrects it', () => {
    const baseline = baselineFromCustomer(customer);
    expect(changedCustomerFields(baseline, { ...baseline, brandName: 'Ashoka' })).toEqual({
      brandName: 'Ashoka',
    });
  });

  it('is not written when it was only read', () => {
    // 'NA' on the record, blank in the box: unchanged, so nothing is sent.
    const withBrand = { ...customer, brandName: 'NA' } as unknown as CustomerDetail;
    const baseline = baselineFromCustomer(withBrand);
    expect(baseline.brandName).toBe('');
    expect(changedCustomerFields(baseline, { ...baseline })).toBeNull();
  });
});
