import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'postgresql://test/test');
vi.stubEnv('NODE_ENV', 'test');

const { buildOpenApiDocument } = await import('./openapi.js');

/**
 * The documentation's job is to be true. A path that does not exist, or a body
 * that is not what the server validates, is worse than no documentation: it
 * sends somebody to build against a contract nobody honours.
 *
 * `app.test.ts` covers that the routes respond; this covers that the document
 * describes the routes that exist.
 */
const doc = buildOpenApiDocument('https://example.test') as {
  openapi: string;
  paths: Record<string, Record<string, { security?: unknown[]; requestBody?: unknown }>>;
  components: { securitySchemes: Record<string, unknown> };
  security: unknown[];
};

describe('the OpenAPI document', () => {
  it('is 3.1, which is what a Zod-generated JSON Schema is valid against', () => {
    expect(doc.openapi).toBe('3.1.0');
  });

  it('describes the paths the app actually mounts', () => {
    // Each of these was checked against its routes file. `/api/monitor/logins`
    // sat here until a live 404 said otherwise.
    for (const path of [
      '/health',
      '/api/auth/login',
      '/api/auth/me',
      '/api/auth/logout',
      '/api/auth/change-password',
      '/api/customers',
      '/api/customers/{id}',
      '/api/customers/{id}/jobs',
      '/api/jobs/{id}',
      '/api/quotations',
      '/api/quotations/next-number',
      '/api/quotations/{id}',
      '/api/quotations/{id}/pdf',
      '/api/quotations/{id}/send',
      '/api/quotations/{id}/versions',
      '/api/quotations/{id}/outcome',
      '/api/production',
      '/api/production/next-number',
      '/api/production/{id}',
      '/api/production/stages/{stageId}',
      '/api/production/{id}/stages',
      '/api/production/{id}/override',
      '/api/materials',
      '/api/materials/rates',
      '/api/materials/{id}/history',
      '/api/gstin/{gstin}',
      '/api/settings',
      '/api/users',
      '/api/users/{id}',
      '/api/users/{id}/password',
      '/api/monitor',
    ]) {
      expect(doc.paths, `missing ${path}`).toHaveProperty([path]);
    }
  });

  it('requires a session everywhere except signing in and the probe', () => {
    // The property that makes a public docs URL safe: a stranger can read the
    // whole surface and change nothing.
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths['/api/auth/login']?.post?.security).toEqual([]);
    expect(doc.paths['/health']?.get?.security).toEqual([]);

    const opted = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.entries(ops)
        .filter(([, op]) => Array.isArray(op.security) && op.security.length === 0)
        .map(([method]) => `${method} ${path}`),
    );
    expect(opted.sort()).toEqual(['get /health', 'post /api/auth/login']);
  });

  it('generates request bodies from the schemas the server validates with', () => {
    const login = doc.paths['/api/auth/login']?.post?.requestBody as {
      content: { 'application/json': { schema: { properties: Record<string, unknown> } } };
    };
    // Not hand-written: these come out of loginSchema itself.
    expect(Object.keys(login.content['application/json'].schema.properties)).toEqual([
      'username',
      'password',
    ]);
  });

  it('points at whichever server asked for it', () => {
    const other = buildOpenApiDocument('http://localhost:4000') as { servers: { url: string }[] };
    expect(other.servers[0]?.url).toBe('http://localhost:4000');
  });
});
