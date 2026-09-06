import { createHash, randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { safeFilename } from '@yuva/shared';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';
import { logger } from './logger.js';

/**
 * Object storage, on Cloudflare R2.
 *
 * **The bytes never pass through this server.** The browser is handed a
 * presigned URL and puts the file into R2 itself; downloads are the same in
 * reverse. A 40 MB artwork proxied through a single Render instance would hold
 * that one process for the length of the upload, and the works' connection is
 * not fast. Signing a URL takes about a millisecond and Cloudflare does the
 * rest.
 *
 * R2 speaks S3, so this is the AWS SDK pointed at Cloudflare's endpoint with
 * `auto` as the region. Two R2 differences are worth knowing:
 *
 *   - It has no ACLs. The bucket is private and every read is a signed URL;
 *     there is no public-read flag to set or to forget to unset.
 *   - Its CORS rules are configured on the bucket, not per request, so a
 *     browser upload fails at the preflight until the bucket allows the web
 *     origin. That is a Cloudflare dashboard setting, not something this code
 *     can arrange — see the API README.
 */

/** Long enough for a slow works connection to finish a 50 MB PUT. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
/** Short: a view URL that leaks is a file anyone can read until it expires. */
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

/** Whether artwork storage is configured at all. */
export function isStorageConfigured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  );
}

/** The error every caller gives when it is not. */
export function storageUnavailable(): ApiError {
  return ApiError.badRequest(
    'File storage is not configured on this server, so artwork cannot be uploaded or opened. ' +
      'Set the R2_* keys in the API environment.',
  );
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!isStorageConfigured()) throw storageUnavailable();
  if (client) return client;

  client = new S3Client({
    /* R2 is one global namespace; the SDK still insists on a region. */
    region: 'auto',
    endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    },
    /*
     * Path style, so the bucket is in the URL rather than in the hostname.
     * R2's endpoint is per account, not per bucket, and a virtual-hosted URL
     * would sign against a host that does not resolve.
     */
    forcePathStyle: true,
  });
  return client;
}

const bucket = (): string => env.R2_BUCKET as string;

/**
 * Where one file lives.
 *
 * Foldered by job, so anyone opening the bucket sees the design a file belongs
 * to without this database. A random segment before the name keeps two uploads
 * of `artwork.pdf` from colliding and stops a key being guessable — a key is
 * not a secret, since every read is signed, but there is no reason to make it
 * a name somebody could try.
 */
export function artworkKey(jobId: string, filename: string): string {
  return `jobs/${jobId}/${randomUUID()}/${safeFilename(filename)}`;
}

/** A presigned PUT. Single use in practice: the key is never issued twice. */
export async function signUpload(
  key: string,
  contentType: string,
): Promise<{ url: string; headers: Record<string, string>; expiresInSeconds: number }> {
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );

  /*
   * Sent with the PUT so the object is *stored* as the type resolved from the
   * extension rather than as whatever the browser guessed — an `.ai` filed as
   * `application/pdf` is confusing to anyone who opens the bucket.
   *
   * It is not part of the signature: a presigned URL signs only `host`
   * (verified against a live S3-compatible server — `X-Amz-SignedHeaders` is
   * `host` and a PUT sending a different type is accepted). So this is
   * housekeeping, not enforcement, and nothing downstream depends on it: every
   * download overrides the type from the record, which is the copy the office
   * can see and correct.
   */
  return {
    url,
    headers: { 'Content-Type': contentType },
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  };
}

/**
 * A presigned GET.
 *
 * `download` decides what the browser does with it: a proof opens in a tab, an
 * `.ai` is saved. Either way the stored object keeps the designer's own
 * filename, which the key does not — the key is sanitised.
 */
export async function signDownload(
  key: string,
  filename: string,
  options: { download: boolean; contentType?: string | undefined } = { download: true },
): Promise<{ url: string; expiresInSeconds: number }> {
  const disposition = options.download ? 'attachment' : 'inline';
  /* RFC 5987, so a name with a space or a Devanagari character survives. */
  const encoded = encodeURIComponent(filename);

  const url = await getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encoded}`,
      ...(options.contentType ? { ResponseContentType: options.contentType } : {}),
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );

  return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
}

/**
 * What is actually in the bucket under this key, or null if nothing is.
 *
 * This is how an upload is confirmed. The browser reporting success is not
 * evidence — a PUT that 403s still resolves in some paths, and the size it
 * claimed is whatever the page chose to send.
 */
export async function statObject(key: string): Promise<StoredObject | null> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return {
      sizeBytes: Number(head.ContentLength ?? 0),
      contentType: head.ContentType ?? null,
    };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    logger.error({ err: error, key }, 'R2 HEAD failed');
    throw ApiError.badRequest(
      'Could not reach file storage to check that upload. Try again in a moment.',
    );
  }
}

/**
 * Erases an object, and says whether it worked.
 *
 * S3 delete is idempotent — removing a key that is not there succeeds — so a
 * true result means "no object under this key", which is exactly what both
 * callers need to hear.
 */
export async function deleteObject(key: string): Promise<boolean> {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (error) {
    logger.warn({ err: error, key }, 'R2 delete failed; object left behind');
    return false;
  }
}

/**
 * Erases an object, or throws.
 *
 * For a deliberate permanent delete, where the caller is about to record that
 * the file is gone. Reporting success on a failed delete would leave the
 * register saying a customer's artwork was erased while it sat in the bucket —
 * the one outcome worse than refusing.
 */
export async function deleteObjectOrThrow(key: string): Promise<void> {
  if (await deleteObject(key)) return;
  throw ApiError.badRequest(
    'The file could not be erased from storage, so nothing was changed. Try again in a moment.',
  );
}

/** Fingerprints the configuration for the health endpoint, without the secret. */
export function storageFingerprint(): string | null {
  if (!isStorageConfigured()) return null;
  return createHash('sha256')
    .update(`${env.R2_ACCOUNT_ID}:${env.R2_BUCKET}`)
    .digest('hex')
    .slice(0, 8);
}
