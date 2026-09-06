import type { ArtworkKind, ArtworkStatus } from '../lib/artwork.js';

/** One file on a design. */
export interface Artwork {
  id: string;
  jobId: string;
  kind: ArtworkKind;
  status: ArtworkStatus;

  /** What the designer called it. Shown, and what a download is saved as. */
  filename: string;
  contentType: string;
  /** What R2 reports the stored object to be, not what the browser claimed. */
  sizeBytes: number;

  /**
   * Which revision this is. A file uploaded to replace another carries its
   * version plus one, so "v3" on screen means three files exist and two are
   * still on record.
   */
  version: number;
  /** The row this one replaced, where it replaced one. */
  replacesId: string | null;

  notes: string;
  uploadedBy: string;
  uploadedAt: string | null;

  /**
   * Who erased the file, and when. Set only on DELETED, and kept — the row
   * outlives the bytes so the design can still say what was there.
   */
  deletedBy: string | null;
  deletedAt: string | null;

  createdAt: string;
}

/**
 * A file as the design screen lists it.
 *
 * `previewUrl` is signed with the list rather than fetched per thumbnail:
 * signing costs an HMAC and no network call, so twelve files cost one request
 * instead of thirteen. It is short-lived like every other read URL, which is
 * why the list is refetched on a timer — an image whose URL expired while the
 * screen sat open would otherwise quietly break.
 *
 * Null for anything a browser will not draw: a PDF, an AI, a CDR, a TIFF.
 */
export interface ArtworkFile extends Artwork {
  previewUrl: string | null;
}

/**
 * Everything the browser needs to put one file into R2 itself.
 *
 * The bytes never pass through the API. A 40 MB artwork through a Render free
 * instance would occupy the one process for the whole upload; this way the
 * server signs a URL in a millisecond and Cloudflare takes the file.
 */
export interface ArtworkUploadTicket {
  /** The PENDING row. Confirm against this id once the PUT succeeds. */
  artwork: Artwork;
  /** A presigned PUT. Single use, short-lived. */
  uploadUrl: string;
  /** Headers the PUT must carry, or R2 rejects the signature. */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/** A presigned GET, for viewing or downloading one file. */
export interface ArtworkLink {
  url: string;
  expiresInSeconds: number;
}
