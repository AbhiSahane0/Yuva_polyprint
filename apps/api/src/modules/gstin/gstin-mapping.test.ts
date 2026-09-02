import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'postgresql://test/test');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('GSTIN_API_KEY', 'test-key');

const findUnique = vi.fn().mockResolvedValue(null);
const upsert = vi.fn().mockResolvedValue({});
vi.mock('../../lib/prisma.js', () => ({ prisma: { appSetting: { findUnique, upsert } } }));

const { lookupGstin } = await import('./gstin.service.js');

/**
 * The real 200 from gstinapi.in for the works' own GSTIN, copied verbatim.
 *
 * This exists because the first mapping was written from a document and was
 * wrong in a way nothing caught: the payload is nested under `data`, so every
 * field came back null with no error to explain it. A recorded response is the
 * only thing that would have failed then and will fail again if the provider
 * moves a field.
 */
const REAL_RESPONSE = {
  success: true,
  gstin: '27AIGPH5992Q1ZD',
  data: {
    gstin: '27AIGPH5992Q1ZD',
    legal_name: 'ANAND KISAN HASE',
    trade_name: 'YUVA POLYPRINT AND PACKAGING INDUSTRIES',
    status: 'Active',
    taxpayer_type: 'Regular',
    business_constitution: null,
    registration_date: '2018-03-12',
    cancellation_date: null,
    state_code: '27',
    state_jurisdiction: null,
    address: 'PLOT NO. 163A, S. NO. 51/2, SANGAMNER CO-OP INDUSTRIAL ESTATE, GUNJALWADI, SANGAMNER',
    city: 'SANGAMNER',
    address_details: {
      building_number: 'PLOT NO. 163A',
      building_name: 'SANGAMNER CO-OP INDUSTRIAL ESTATE',
      floor: 'S. NO. 51/2',
      street: 'GUNJALWADI',
      locality: 'SANGAMNER',
      district: null,
      city: null,
      state: null,
      landmark: null,
      pincode: '422605',
    },
    pincode: '422605',
    nature_of_business: null,
    block_status: 'Unblocked',
  },
  billed_to: 'paid',
  credits_remaining: 99,
  free_remaining: 0,
  response_ms: 231,
};

describe('mapping a real provider response', () => {
  it('reads every field out of the nested payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(REAL_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await lookupGstin('27AIGPH5992Q1ZD');

    expect(result.legalName).toBe('ANAND KISAN HASE');
    expect(result.tradeName).toBe('YUVA POLYPRINT AND PACKAGING INDUSTRIES');
    expect(result.status).toBe('Active');
    expect(result.taxpayerType).toBe('Regular');
    expect(result.registrationDate).toBe('2018-03-12');
    expect(result.blockStatus).toBe('Unblocked');
    expect(result.cancellationDate).toBeNull();

    // The composed line, not one reassembled from the parts — the registry's
    // own wording reads like an address and the parts do not.
    expect(result.address).toBe(
      'PLOT NO. 163A, S. NO. 51/2, SANGAMNER CO-OP INDUSTRIAL ESTATE, GUNJALWADI, SANGAMNER',
    );
    // Top level wins: address_details.city is null on this record.
    expect(result.city).toBe('SANGAMNER');
    expect(result.pincode).toBe('422605');

    // Null, not an empty array, in the response. Must not reach the client as null.
    expect(result.natureOfBusiness).toEqual([]);

    expect(result.fromCache).toBe(false);
    vi.restoreAllMocks();
  });

  it('is what gets cached, so the credit is spent once', async () => {
    upsert.mockClear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(REAL_RESPONSE), { status: 200 }),
    );

    await lookupGstin('27AIGPH5992Q1ZD');

    expect(upsert).toHaveBeenCalledOnce();
    const written = JSON.parse(upsert.mock.calls[0][0].create.value);
    expect(written.tradeName).toBe('YUVA POLYPRINT AND PACKAGING INDUSTRIES');
    vi.restoreAllMocks();
  });

  it('does not let a failed cache write lose the answer that was paid for', async () => {
    upsert.mockRejectedValueOnce(new Error('database is down'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(REAL_RESPONSE), { status: 200 }),
    );

    const result = await lookupGstin('27AIGPH5992Q1ZD');

    expect(result.tradeName).toBe('YUVA POLYPRINT AND PACKAGING INDUSTRIES');
    vi.restoreAllMocks();
  });
});
