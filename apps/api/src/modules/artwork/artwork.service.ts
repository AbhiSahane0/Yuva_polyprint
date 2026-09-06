import {
  hasFile,
  isPreviewable,
  resolveContentType,
  type Artwork,
  type ArtworkFile,
  type ArtworkLink,
  type ArtworkUploadTicket,
  type ListArtworkQuery,
  type RequestArtworkUploadInput,
  type UpdateArtworkInput,
} from '@yuva/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import {
  artworkKey,
  deleteObject,
  deleteObjectOrThrow,
  isStorageConfigured,
  signDownload,
  signUpload,
  statObject,
  storageUnavailable,
} from '../../lib/storage.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * Design artwork.
 *
 * Uploading is two calls with a Cloudflare PUT between them, because the bytes
 * do not come through this server:
 *
 *   1. `requestUpload` writes a PENDING row and signs a URL for its key.
 *   2. The browser PUTs the file straight to R2.
 *   3. `confirmUpload` asks R2 what actually arrived and, if it did, makes the
 *      row ACTIVE with the size R2 reports.
 *
 * The row first, then the object, is the order that matters. Signing a key
 * with no row would let anyone who could reach step 3 attach an arbitrary key
 * to a design; and an upload that fails leaves a PENDING row that can be seen
 * and cleaned, rather than an object in a bucket belonging to nothing.
 *
 * Nothing confirmed is ever deleted. A cylinder was engraved from one of these
 * files, and a register naming a file that has gone is worth less than no
 * register at all.
 */

type ArtworkRow = Prisma.JobArtworkGetPayload<Record<string, never>>;

function toArtwork(row: ArtworkRow): Artwork {
  return {
    id: row.id,
    jobId: row.jobId,
    kind: row.kind,
    status: row.status,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    version: row.version,
    replacesId: row.replacesId,
    notes: row.notes,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt?.toISOString() ?? null,
    deletedBy: row.deletedBy,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * What a PENDING row is given before it is written off.
 *
 * Fifteen minutes matches the signed URL's life: past it the browser could not
 * complete the upload even if it were still trying, so the row can never
 * become anything.
 */
const PENDING_TTL_MS = 15 * 60 * 1000;

const isStale = (row: ArtworkRow): boolean =>
  row.status === 'PENDING' && Date.now() - row.createdAt.getTime() > PENDING_TTL_MS;

async function findOrThrow(id: string): Promise<ArtworkRow> {
  const row = await prisma.jobArtwork.findUnique({ where: { id } });
  if (!row) throw ApiError.notFound('That file is not on record');
  return row;
}

/**
 * The files on one design.
 *
 * PENDING rows are left out unless they are this minute's: an upload in flight
 * is worth showing, an upload that failed an hour ago is noise. Superseded and
 * removed files are behind `includeArchived`, so the screen shows what is
 * current and the history is a click away.
 */
export async function listForJob(jobId: string, query: ListArtworkQuery): Promise<ArtworkFile[]> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) throw ApiError.notFound('That design is not on record');

  const rows = await prisma.jobArtwork.findMany({
    where: {
      jobId,
      ...(query.includeArchived ? {} : { status: { in: ['PENDING', 'ACTIVE'] } }),
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  const live = rows.filter((row) => !isStale(row));

  /*
   * Thumbnails are signed here rather than fetched one by one: signing is an
   * HMAC and no network call, so twelve files cost this request and no more.
   * The signature is only minted for what a browser will actually draw.
   */
  return Promise.all(
    live.map(async (row): Promise<ArtworkFile> => {
      const wantsPreview =
        isStorageConfigured() &&
        hasFile(row.status) &&
        row.storageKey !== null &&
        isPreviewable(row.contentType);

      const previewUrl = wantsPreview
        ? (
            await signDownload(row.storageKey as string, row.filename, {
              download: false,
              contentType: row.contentType,
            })
          ).url
        : null;

      return { ...toArtwork(row), previewUrl };
    }),
  );
}

/** Signs one upload, and books the row it will belong to. */
export async function requestUpload(
  input: RequestArtworkUploadInput,
  uploadedBy: string,
): Promise<ArtworkUploadTicket> {
  if (!isStorageConfigured()) throw storageUnavailable();

  const job = await prisma.job.findUnique({ where: { id: input.jobId }, select: { id: true } });
  if (!job) throw ApiError.notFound('That design is not on record');

  /*
   * Resolved here rather than taken from the browser, and by the same rule the
   * shared schema validated with: the extension decides, because Chrome sends
   * a `.cdr` as `application/octet-stream` and an `.ai` as `application/pdf`.
   */
  const contentType = resolveContentType(input.filename, input.contentType);
  if (contentType === null) {
    throw ApiError.badRequest(
      'That file type is not accepted. Send a PDF, an image, an AI/EPS, a CDR or a ZIP.',
    );
  }

  let version = 1;
  if (input.replacesId !== null) {
    const previous = await findOrThrow(input.replacesId);
    if (previous.jobId !== input.jobId) {
      throw ApiError.badRequest('That file belongs to a different design');
    }
    if (previous.status !== 'ACTIVE') {
      throw ApiError.badRequest(
        previous.status === 'SUPERSEDED'
          ? 'That file has already been replaced. Replace the current one instead.'
          : 'Only a current file can be replaced',
      );
    }
    version = previous.version + 1;
  }

  const key = artworkKey(input.jobId, input.filename);

  const row = await prisma.jobArtwork.create({
    data: {
      jobId: input.jobId,
      kind: input.kind,
      status: 'PENDING',
      storageKey: key,
      filename: input.filename,
      contentType,
      /* Provisional. Overwritten at confirmation by what R2 reports. */
      sizeBytes: input.sizeBytes,
      version,
      replacesId: input.replacesId,
      notes: input.notes,
      uploadedBy,
    },
  });

  const signed = await signUpload(key, contentType);

  return {
    artwork: toArtwork(row),
    uploadUrl: signed.url,
    headers: signed.headers,
    expiresInSeconds: signed.expiresInSeconds,
  };
}

/**
 * Confirms an upload against the bucket.
 *
 * R2 is asked what arrived rather than the browser being believed. A PUT that
 * was rejected still resolves in some paths, and the size the page reported is
 * whatever the page chose to send; the size stored here is Cloudflare's.
 */
export async function confirmUpload(id: string): Promise<Artwork> {
  if (!isStorageConfigured()) throw storageUnavailable();

  const row = await findOrThrow(id);
  if (row.status !== 'PENDING') {
    /* A retried confirmation is not an error — it is the same outcome. */
    if (row.status === 'ACTIVE') return toArtwork(row);
    throw ApiError.badRequest('That upload has already been settled');
  }

  /* PENDING always carries its key; the guard is for the type, not the case. */
  if (row.storageKey === null) throw ApiError.badRequest('That upload has no storage key');

  const object = await statObject(row.storageKey);
  if (object === null) {
    throw ApiError.badRequest('That file did not reach storage. Try the upload again.');
  }

  /*
   * Superseding happens here, not at step 1: until the file is actually in the
   * bucket, replacing the current one would leave the design with no current
   * artwork and an upload that may never finish.
   */
  const updated = await prisma.$transaction(async (tx) => {
    if (row.replacesId !== null) {
      await tx.jobArtwork.update({
        where: { id: row.replacesId },
        data: { status: 'SUPERSEDED' },
      });
    }

    return tx.jobArtwork.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        sizeBytes: object.sizeBytes,
        uploadedAt: new Date(),
      },
    });
  });

  return toArtwork(updated);
}

/**
 * A link to view or download one file.
 *
 * Minted per request and short-lived, so a URL that ends up in a chat message
 * stops working rather than standing as a permanent public link to a
 * customer's unreleased packaging.
 */
export async function linkFor(id: string, download: boolean): Promise<ArtworkLink> {
  if (!isStorageConfigured()) throw storageUnavailable();

  const row = await findOrThrow(id);
  if (row.status === 'PENDING') throw ApiError.badRequest('That file has not finished uploading');
  if (row.status === 'DELETED' || row.storageKey === null) {
    throw ApiError.badRequest(
      `That file was deleted${row.deletedBy ? ` by ${row.deletedBy}` : ''} and no longer exists`,
    );
  }

  return signDownload(row.storageKey, row.filename, { download, contentType: row.contentType });
}

/** Refiling: which kind it is, and the note beside it. The file never changes. */
export async function update(id: string, input: UpdateArtworkInput): Promise<Artwork> {
  const row = await findOrThrow(id);
  if (row.status === 'PENDING') throw ApiError.badRequest('That file has not finished uploading');
  if (row.status === 'DELETED') throw ApiError.badRequest('That file was deleted');

  const updated = await prisma.jobArtwork.update({
    where: { id: row.id },
    data: {
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  return toArtwork(updated);
}

/**
 * Takes a file off the design screen.
 *
 * A confirmed file is marked REMOVED and its object stays in the bucket —
 * removing is a filing decision, and the cylinders engraved from it are still
 * on the shelf. Only an upload that never completed is deleted outright, since
 * there is nothing there to keep.
 */
export async function remove(id: string): Promise<Artwork> {
  const row = await findOrThrow(id);

  if (row.status === 'PENDING') {
    await prisma.jobArtwork.delete({ where: { id: row.id } });
    if (isStorageConfigured() && row.storageKey) await deleteObject(row.storageKey);
    return toArtwork({ ...row, status: 'REMOVED' });
  }

  if (row.status === 'DELETED') throw ApiError.badRequest('That file was already deleted');
  if (row.status === 'REMOVED') return toArtwork(row);

  const updated = await prisma.jobArtwork.update({
    where: { id: row.id },
    data: { status: 'REMOVED' },
  });
  return toArtwork(updated);
}

/**
 * Erases the file for good.
 *
 * The bytes go and the **row stays**. Those answer different questions: the
 * bytes are what the engraver needs, and the row is what the office needs when
 * it asks where the artwork went. "There were three files and now there are
 * two" is not something anybody can act on; "deleted by Sudeep on 6 September"
 * is.
 *
 * The object goes first, then the record. If it went the other way and the
 * second step failed, the register would say a customer's artwork had been
 * erased while it sat in the bucket — worse than either step failing alone.
 * This order can only leave a row whose file is already gone, which is the
 * state the row is about to claim anyway.
 *
 * A revision chain survives it. Nothing is deleted at the database level, so
 * the foreign key from the file that replaced this one still has its target,
 * and "v3 replaced v2, which was deleted" stays readable.
 */
export async function purge(id: string, deletedBy: string): Promise<Artwork> {
  const row = await findOrThrow(id);

  /* Already gone. Saying so beats a second delete reporting success. */
  if (row.status === 'DELETED') {
    throw ApiError.badRequest(
      `That file was already deleted${row.deletedBy ? ` by ${row.deletedBy}` : ''}`,
    );
  }

  /*
   * A PENDING row has nothing worth a record: the upload never completed, so
   * there is no file anybody sent and nothing to explain later.
   */
  if (row.status === 'PENDING') return remove(id);

  if (!isStorageConfigured()) throw storageUnavailable();
  if (row.storageKey === null) throw ApiError.badRequest('That file has no object to erase');

  await deleteObjectOrThrow(row.storageKey);

  const updated = await prisma.jobArtwork.update({
    where: { id: row.id },
    data: {
      status: 'DELETED',
      /* Nulled so nothing can sign a URL for a key that is no longer there. */
      storageKey: null,
      deletedBy,
      deletedAt: new Date(),
    },
  });

  return toArtwork(updated);
}

/** Puts a removed file back. The object never went anywhere. */
export async function restore(id: string): Promise<Artwork> {
  const row = await findOrThrow(id);
  if (row.status === 'DELETED') {
    /* There is nothing to put back — the object was erased, not filed away. */
    throw ApiError.badRequest('That file was deleted and cannot be restored');
  }
  if (row.status !== 'REMOVED') throw ApiError.badRequest('That file is not removed');

  /*
   * Back to ACTIVE unless something replaced it while it was off the screen,
   * in which case it is history and saying otherwise would give the design two
   * current files claiming to be the same artwork.
   */
  const replacement = await prisma.jobArtwork.findFirst({
    where: { replacesId: row.id, status: { in: ['ACTIVE', 'SUPERSEDED'] } },
    select: { id: true },
  });

  const updated = await prisma.jobArtwork.update({
    where: { id: row.id },
    data: { status: replacement ? 'SUPERSEDED' : 'ACTIVE' },
  });
  return toArtwork(updated);
}
