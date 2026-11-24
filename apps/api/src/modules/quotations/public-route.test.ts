import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';

/**
 * **The one part of this API a stranger can reach.**
 *
 * No database here, so these stop at the guards — which is exactly the layer
 * worth testing. A malformed token is refused by the router before any query
 * runs, and the office's own routes must still answer 401 to the same caller.
 */
const app = createApp();

/** Valid in shape, certainly not in the database. */
const SHAPED = 'a'.repeat(64);

describe('the customer’s link', () => {
  it('is reachable with no session at all', async () => {
    const response = await request(app).get(`/api/public/quotations/${SHAPED}`);

    /* Whatever it answers, it must not be "sign in" — the customer cannot. */
    expect(response.status).not.toBe(401);
  });

  /* 422 is this API's answer to a request that is shaped wrongly — the same
     as every other validated route, so the public ones are not a special
     case anybody has to remember. */
  it('turns away anything that is not a token, before touching the database', async () => {
    for (const token of ['admin', '123', 'a'.repeat(63), `${'a'.repeat(63)}Z`]) {
      const response = await request(app).get(`/api/public/quotations/${token}`);
      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    }
  });

  it('refuses an answer that names nobody', async () => {
    const response = await request(app)
      .post(`/api/public/quotations/${SHAPED}/respond`)
      .send({ decision: 'ACCEPTED', personName: '' });

    expect(response.status).toBe(422);
  });

  /*
   * The reason the office's own form asks the same thing: "they said no"
   * teaches nothing a year later, and the reason is the only part of a loss
   * worth keeping.
   */
  it('refuses a refusal with no reason', async () => {
    const response = await request(app)
      .post(`/api/public/quotations/${SHAPED}/respond`)
      .send({ decision: 'DECLINED', personName: 'Sunil Kale', note: '' });

    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toContain('why');
  });

  it('refuses a decision that is neither', async () => {
    const response = await request(app)
      .post(`/api/public/quotations/${SHAPED}/respond`)
      .send({ decision: 'MAYBE', personName: 'Sunil Kale' });

    expect(response.status).toBe(422);
  });
});

describe('what stayed behind the sign-in', () => {
  /*
   * The whole risk of adding a public router is that something else slips
   * through it. These are the two the customer-facing side touches.
   */
  it('still refuses the office’s own quotation list', async () => {
    const response = await request(app).get('/api/quotations');
    expect(response.status).toBe(401);
  });

  it('still refuses minting a link', async () => {
    const response = await request(app).post('/api/quotations/some-id/link');
    expect(response.status).toBe(401);
  });

  it('still refuses reading one quotation by its id', async () => {
    const response = await request(app).get('/api/quotations/some-id');
    expect(response.status).toBe(401);
  });
});
