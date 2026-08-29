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
  it('challenges a request that carries no credentials', async () => {
    const response = await request(app).get('/api/monitor');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic realm=');
  });

  it('challenges a bearer token, which is not what this endpoint accepts', async () => {
    const response = await request(app).get('/api/monitor').set('Authorization', 'Bearer abc123');

    expect(response.status).toBe(401);
  });
});
