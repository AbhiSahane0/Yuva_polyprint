import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const app = createApp();

describe('application shell', () => {
  it('serves the liveness probe', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
  });

  it('returns a request correlation id', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('answers unknown routes with the standard failure envelope', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('does not advertise the server framework', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('sign-in monitor', () => {
  /*
   * Only the no-credentials case belongs here. Anything that presents a token
   * has to be looked up in the sessions table, and these tests run without a
   * database — the guard itself is covered in middleware/authenticate.test.ts.
   */
  it('refuses a request with no session', async () => {
    const response = await request(app).get('/api/monitor');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false });
  });
});
