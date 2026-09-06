import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Three properties of the artwork store that no test of a pure function
 * reaches, and each is a failure of omission — the kind that passes review
 * because the code that would be wrong simply is not there.
 */
const read = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const SERVICE = read('./artwork.service.ts');
const ROUTES = read('./artwork.routes.ts');
const STORAGE = read('../../lib/storage.ts');

describe('the artwork store', () => {
  it('erases the object before recording that it is gone', () => {
    /*
     * The other order has a failure mode worth avoiding: if the row were
     * marked DELETED first and the erase then failed, the register would say a
     * customer's artwork had been destroyed while it sat in the bucket. This
     * order can only leave a row whose file is already gone — which is exactly
     * what the row is about to claim.
     */
    const purge = SERVICE.slice(
      SERVICE.indexOf('export async function purge'),
      SERVICE.indexOf('export async function restore'),
    );
    expect(purge.indexOf('deleteObjectOrThrow')).toBeLessThan(purge.indexOf('jobArtwork.update'));
    /* And a failed erase must stop the whole thing, not be logged past. */
    expect(purge).not.toContain('await deleteObject(');
  });

  it('keeps the row when the file is erased', () => {
    /*
     * The bytes and the record answer different questions. "There were three
     * files and now there are two" is not something anybody can act on; the
     * office asks where the artwork went, and a name and a date is an answer.
     */
    const purge = SERVICE.slice(
      SERVICE.indexOf('export async function purge'),
      SERVICE.indexOf('export async function restore'),
    );
    expect(purge).toContain("status: 'DELETED'");
    expect(purge).toContain('deletedBy');
    expect(purge).toContain('deletedAt');
    /* No row deletion in this path — a PENDING one is handed to remove(). */
    expect(purge).not.toContain('jobArtwork.delete(');

    /* Nulling the key is what stops anything signing a URL for it later. */
    expect(purge).toContain('storageKey: null');
  });

  it('offers nothing to open on a file that no longer exists', () => {
    /*
     * Every read path has to say so rather than sign a URL that 404s at
     * Cloudflare — an error from R2 reads as a broken app, not as a file
     * somebody deleted on purpose.
     */
    const link = SERVICE.slice(
      SERVICE.indexOf('export async function linkFor'),
      SERVICE.indexOf('export async function update'),
    );
    expect(link).toContain("status === 'DELETED'");

    const restore = SERVICE.slice(SERVICE.indexOf('export async function restore'));
    expect(restore).toContain("status === 'DELETED'");
  });

  it('never deletes the row for a confirmed file, even when erasing it', () => {
    /*
     * A cylinder on the shelf was engraved from one of these. The bytes can go
     * — a wrong upload should not sit in a bucket forever — but the row must
     * not, or the design silently has one fewer file than it did and nobody
     * can say why. So removing on screen is a status, erasing is a status, and
     * the only row ever deleted is a PENDING one where nothing arrived.
     */
    const remove = SERVICE.slice(
      SERVICE.indexOf('export async function remove'),
      SERVICE.indexOf('export async function restore'),
    );
    expect(remove).toContain("status: 'REMOVED'");

    /* The only delete in the file, and it is behind the PENDING branch. */
    const deletes = SERVICE.match(/jobArtwork\.delete/g) ?? [];
    expect(deletes).toHaveLength(1);
    expect(remove.indexOf("row.status === 'PENDING'")).toBeLessThan(
      remove.indexOf('jobArtwork.delete'),
    );
    expect(SERVICE).not.toContain('jobArtwork.deleteMany');
  });

  it('takes the stored size from R2, not from the browser', () => {
    /*
     * The bytes never pass through this server, so the only figure it can
     * verify is the one Cloudflare reports. A PUT that was rejected still
     * resolves in some paths, and the size the page sent is whatever the page
     * chose to send.
     */
    const confirm = SERVICE.slice(
      SERVICE.indexOf('export async function confirmUpload'),
      SERVICE.indexOf('export async function linkFor'),
    );
    expect(confirm).toContain('statObject(row.storageKey)');
    expect(confirm).toContain('sizeBytes: object.sizeBytes');
    expect(confirm).not.toContain('input.sizeBytes');
  });

  it('supersedes only once the replacement is actually in the bucket', () => {
    /*
     * Superseding when the upload is signed would leave the design with no
     * current artwork and an upload that may never finish — the office would
     * open the design and find the file gone.
     */
    const request = SERVICE.slice(
      SERVICE.indexOf('export async function requestUpload'),
      SERVICE.indexOf('export async function confirmUpload'),
    );
    /* It reads the word — replacing a replaced file is refused — but writes none. */
    expect(request).not.toContain("status: 'SUPERSEDED'");
    expect(request).not.toContain('jobArtwork.update');

    const confirm = SERVICE.slice(
      SERVICE.indexOf('export async function confirmUpload'),
      SERVICE.indexOf('export async function linkFor'),
    );
    expect(confirm).toContain("status: 'SUPERSEDED'");
    /* Both writes together, or a crash between them loses the current file. */
    expect(confirm).toContain('prisma.$transaction');
  });

  it('accepts only a key it issued itself', () => {
    /*
     * The row is written before the object exists, and confirmation names the
     * row. If a key came from the request instead, anyone who could reach
     * confirm could attach an arbitrary object — or another customer's
     * artwork — to a design.
     */
    expect(SERVICE).toContain('artworkKey(input.jobId, input.filename)');
    expect(SERVICE).not.toContain('input.storageKey');
    expect(SERVICE).not.toContain('input.key');
  });
});

describe('storage', () => {
  it('never streams bytes through this process', () => {
    /*
     * A 40 MB artwork proxied through one Render instance holds that process
     * for the length of the upload. Every transfer is a presigned URL the
     * browser uses directly, which is why nothing here reads or writes a body.
     */
    expect(STORAGE).toContain('getSignedUrl');
    expect(STORAGE).not.toContain('Body:');
    expect(STORAGE).not.toContain('createReadStream');
  });

  it('serves each file as the type on the record, not the type in the bucket', () => {
    /*
     * A presigned URL signs only `host` — measured against a live
     * S3-compatible server — so the Content-Type the browser sends with its
     * PUT is accepted whatever it is, and the object can end up stored as
     * `application/octet-stream`. What makes that harmless is here: every
     * download overrides the served type from the record, which is resolved
     * from the extension and which the office can see.
     */
    const sign = STORAGE.slice(
      STORAGE.indexOf('export async function signDownload'),
      STORAGE.indexOf('export async function statObject'),
    );
    expect(sign).toContain('ResponseContentType: options.contentType');
    expect(sign).toContain('ResponseContentDisposition');

    /* And the caller always passes it, so the override is never skipped. */
    for (const call of SERVICE.match(/signDownload\([\s\S]*?\)\)?;?/g) ?? []) {
      expect(call).toContain('contentType');
    }
  });
});

describe('artwork routes', () => {
  it('gives erasing its own path rather than a flag on remove', () => {
    /*
     * A query parameter that turns "hide it" into "erase a customer's artwork"
     * is one typo away from a file nobody can get back, and it would not show
     * up in a route table at all.
     */
    expect(ROUTES).toContain("'/:id/file'");
    const remove = ROUTES.slice(ROUTES.indexOf("router.delete(\n  '/:id'"));
    expect(remove.slice(0, remove.indexOf(');'))).not.toContain('permanent');
  });

  it('guards every write on the cylinders module and no read', () => {
    /*
     * Reading is open to anyone signed in: the floor works to the file the job
     * prints, and gating that on the cylinders module hides it from exactly
     * the people who need it. Writing is a different question.
     */
    const writes = ROUTES.match(/router\.(post|patch|delete)\([\s\S]*?\);/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const route of writes) {
      expect(route).toContain("requireModule('cylinders')");
    }

    const reads = ROUTES.match(/router\.get\([\s\S]*?\);/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const route of reads) {
      expect(route).not.toContain('requireModule');
    }
  });
});
