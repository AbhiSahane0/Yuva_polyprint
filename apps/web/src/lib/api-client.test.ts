import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * **A failed save has to say that nothing was saved.**
 *
 * What the floor saw when the API was restarting: "Request failed with status
 * code 502". That is axios' own text, reached because the gateway answered
 * with HTML rather than the API's `{ success: false }` envelope, so the
 * mapping below fell through to `error.message`.
 *
 * It names nothing anybody can do and leaves out the one fact that matters —
 * whether the change went in. On a job card where a field rolls back to its
 * old value, a message that does not say "nothing was saved" invites somebody
 * to assume it did.
 *
 * Checked at the source: the interceptor is one expression and rendering it
 * needs a server, a proxy and a failure, which is three things to stage for a
 * string.
 */
const SOURCE = readFileSync(join(resolve(process.cwd(), 'src'), 'lib', 'api-client.ts'), 'utf8');

const MAPPING = SOURCE.slice(
  SOURCE.indexOf('const message ='),
  SOURCE.indexOf('ERROR_CODE.INTERNAL_ERROR, status'),
);

describe('what a failed request tells the works', () => {
  it('has an answer for a gateway that is not answering', () => {
    for (const status of ['502', '503', '504']) {
      expect(MAPPING, `status ${status}`).toContain(status);
    }
  });

  it('says nothing was saved, in every case it can', () => {
    /* One per branch that stands for a write that did not happen: timeout,
       unreachable, gateway, and any other 5xx. */
    const says = MAPPING.match(/Nothing was saved/g) ?? [];
    expect(says.length).toBeGreaterThanOrEqual(4);
  });

  it('never shows axios’ own wording as the first choice', () => {
    /* `error.message` stays as the last resort for a 4xx with no envelope,
       and must not be reachable before the cases above. */
    const fallbackAt = MAPPING.indexOf('error.message');
    expect(fallbackAt).toBeGreaterThan(MAPPING.indexOf('status >= 500'));
  });

  it('still treats a timeout and an unreachable server separately', () => {
    expect(MAPPING).toContain('ECONNABORTED');
    expect(MAPPING).toContain('status === 0');
  });
});
