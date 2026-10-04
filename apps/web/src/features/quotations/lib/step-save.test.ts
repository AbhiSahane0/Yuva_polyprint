import { describe, expect, it } from 'vitest';
import type { CustomerDetail, CustomerJob } from '@yuva/shared';
import {
  baselineFromCustomer,
  changedCustomerFields,
  customerDetailsFromForm,
  designFingerprint,
  fingerprintFromSavedJob,
  isSaveableDesign,
  jobPayloadFromLine,
  normalise,
  type CustomerDetails,
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
    expect(changedCustomerFields(baseline, current, baseline)).toBeNull();
  });

  it("does not mistake the importer's NA placeholder for an edit", () => {
    // The bug this exists to prevent: district and email are 'NA' on the record
    // and blank on the form, so a naive diff would write on every quotation.
    const baseline = baselineFromCustomer(customer);
    expect(baseline.district).toBe('');
    expect(baseline.email).toBe('');

    const current = { ...baseline, district: '', email: '' };
    expect(changedCustomerFields(baseline, current, baseline)).toBeNull();
  });

  it('ignores whitespace-only differences', () => {
    const baseline = baselineFromCustomer(customer);
    expect(
      changedCustomerFields(baseline, { ...baseline, city: '  Sangamner  ' }, baseline),
    ).toBeNull();
  });

  it('sends only the fields that moved', () => {
    const baseline = baselineFromCustomer(customer);
    const changed = changedCustomerFields(
      baseline,
      { ...baseline, mobile: '9000000000' },
      baseline,
    );

    // Not the whole customer — a colleague's edit to another field survives.
    expect(changed).toEqual({ mobile: '9000000000' });
  });

  it('refuses to clear a stored field from this screen', () => {
    // Deliberate: see the empty-value rule in changedCustomerFields. Clearing
    // is done on the customer editor, with the whole record in view.
    const baseline = baselineFromCustomer(customer);
    expect(changedCustomerFields(baseline, { ...baseline, mobile: '' }, baseline)).toBeNull();
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

describe('a field nobody changed on this screen', () => {
  /*
   * The rule that exists because a customer's address was wiped twice. On an
   * existing quotation the form shows the document's own snapshot, which can
   * legitimately differ from the customer's record — that is history, not a
   * correction — and comparing against the record alone made every one of those
   * differences look like a deliberate edit. Empty is stored as 'NA', so
   * "looks like an edit" meant "erase it".
   */
  it('is never written, however far it is from the record', () => {
    const baseline = baselineFromCustomer(customer);
    // What an older quotation stored: a different address, no city at all.
    const shown = { ...baseline, address: 'Old address from 2024', city: '' };

    expect(changedCustomerFields(baseline, shown, shown)).toBeNull();
  });

  it('but a field the office does change is written', () => {
    const baseline = baselineFromCustomer(customer);
    const shown = { ...baseline, address: 'Old address from 2024' };
    const current = { ...shown, mobile: '9822334455' };

    // Only the mobile. The stale address sitting beside it is left alone.
    expect(changedCustomerFields(baseline, current, shown)).toEqual({ mobile: '9822334455' });
  });

  it('never lets an empty value overwrite a stored one', () => {
    /*
     * The rule that stops a customer's address disappearing. Observed three
     * times against a real record: the form reported fields as empty when they
     * were not, and 'NA' replaced a real address. Clearing a field is done on
     * the customer editor, where the whole record is in front of you.
     */
    const baseline = baselineFromCustomer(customer);
    const emptied = { ...baseline, address: '', city: '', mobile: '' };

    expect(changedCustomerFields(baseline, emptied, baseline)).toBeNull();
  });

  it('still fills in a field the record does not have', () => {
    // Empty -> something is always safe: nothing is being lost.
    const baseline = baselineFromCustomer(customer);
    expect(baseline.district).toBe('');
    expect(changedCustomerFields(baseline, { ...baseline, district: 'Nashik' }, baseline)).toEqual({
      district: 'Nashik',
    });
  });

  it('reads the form field names onto the customer ones', () => {
    expect(customerDetailsFromForm({ customerName: 'X', addressLine2: 'Sangamner' })).toMatchObject(
      { companyName: 'X', city: 'Sangamner', district: '' },
    );
  });
});

describe('a blank on the quotation is not a decision', () => {
  /**
   * The rule the form fills its boxes by on an existing quotation, stated here
   * because it is what makes the write-back behave.
   *
   * A value typed onto a quotation was a decision about that document and must
   * not be replaced by the company's general one. A blank is not a decision —
   * it is a quotation written before anybody knew the number.
   *
   * Quotation 130 had every contact field blank while its customer carried a
   * mobile, an email and an address. With the snapshot winning outright, the
   * office opened it to six empty boxes, retyped what was already on record,
   * and concluded the write-back was broken.
   */
  const record: CustomerDetails = {
    companyName: 'Family And Quantity Check',
    address: 'Samsherpur',
    city: '',
    district: '',
    mobile: '8485071067',
    email: 'cloudabhi123@gmail.com',
    gstNumber: '',
  };

  /** The merge the form performs: the document first, the record for gaps. */
  const fill = (snapshot: CustomerDetails, customer: CustomerDetails): CustomerDetails => {
    const merged = { ...snapshot };
    for (const key of Object.keys(snapshot) as (keyof CustomerDetails)[]) {
      if (normalise(merged[key]) === '') merged[key] = customer[key];
    }
    return merged;
  };

  const blankSnapshot: CustomerDetails = {
    companyName: 'Family And Quantity Check',
    address: '',
    city: '',
    district: '',
    mobile: '',
    email: '',
    gstNumber: '',
  };

  it('fills what the quotation left blank', () => {
    const shown = fill(blankSnapshot, record);
    expect(shown.mobile).toBe('8485071067');
    expect(shown.email).toBe('cloudabhi123@gmail.com');
    expect(shown.address).toBe('Samsherpur');
  });

  it('keeps a correction the quotation actually carries', () => {
    // An address typed onto one document is not overwritten by the company's.
    const corrected = { ...blankSnapshot, address: 'Plot 14, MIDC' };
    expect(fill(corrected, record).address).toBe('Plot 14, MIDC');
  });

  it('writes nothing back when only the gaps were filled', () => {
    /*
     * The half that stops the fill looking like an edit. `shown` records what
     * ended up on screen, so a Next that changed nothing sends nothing.
     */
    const shown = fill(blankSnapshot, record);
    expect(changedCustomerFields(record, shown, shown)).toBeNull();
  });

  it('still writes a real correction made on top of a filled gap', () => {
    const shown = fill(blankSnapshot, record);
    const edited = { ...shown, mobile: '9876500011' };
    expect(changedCustomerFields(record, edited, shown)).toEqual({ mobile: '9876500011' });
  });
});
