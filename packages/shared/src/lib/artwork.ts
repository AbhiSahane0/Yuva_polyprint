/**
 * Artwork — the design files a job prints from.
 *
 * **A design is a job**, exactly as the cylinder register has it, so artwork
 * hangs off the job and nothing here holds a second copy of the customer. "The
 * files for A S Agro" is that customer's jobs' files; it is a filter, not a
 * separate cupboard, and a file filed against a customer rather than a job is
 * one nobody can tell apart from the four other designs they run.
 *
 * Files are never replaced in place. The cylinder on the shelf was engraved
 * from one particular version of one particular file, and a store that
 * overwrites cannot answer which. A revision supersedes its predecessor and
 * both stay on record.
 */

export const ARTWORK_KINDS = ['ARTWORK', 'PROOF', 'REFERENCE', 'OTHER'] as const;
export type ArtworkKind = (typeof ARTWORK_KINDS)[number];

export const ARTWORK_KIND_LABELS: Record<ArtworkKind, string> = {
  ARTWORK: 'Artwork',
  PROOF: 'Proof',
  REFERENCE: 'Reference',
  OTHER: 'Other',
};

export const ARTWORK_KIND_HINTS: Record<ArtworkKind, string> = {
  ARTWORK: 'The file the cylinders are engraved from',
  PROOF: 'A colour proof or an approved print',
  REFERENCE: 'A photo of the pouch, or an older sample',
  OTHER: 'Anything else worth keeping with the design',
};

/**
 * Where a file is in its life.
 *
 * PENDING exists because the browser puts the bytes into R2 itself and the API
 * never sees them: the row is written before the upload so an object that
 * arrives has something to belong to, and nobody can confirm a key this server
 * did not issue. A PENDING row whose upload failed is a row, not a mystery
 * object in a bucket.
 */
export const ARTWORK_STATUSES = ['PENDING', 'ACTIVE', 'SUPERSEDED', 'REMOVED'] as const;
export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];

export const ARTWORK_STATUS_LABELS: Record<ArtworkStatus, string> = {
  PENDING: 'Uploading',
  ACTIVE: 'Current',
  SUPERSEDED: 'Replaced',
  REMOVED: 'Removed',
};

/** 50 MB. A packaged rotogravure artwork with its linked images reaches this. */
export const MAX_ARTWORK_BYTES = 50 * 1024 * 1024;

/**
 * What may be uploaded, and the extension each is written with.
 *
 * Browsers do not agree on a type for the trade formats — Chrome sends `.cdr`
 * as `application/octet-stream` and `.ai` as `application/pdf`, because an
 * Illustrator file *is* a PDF — so the extension decides and the browser's
 * guess is only a fallback. Both are checked; neither is trusted alone.
 *
 * SVG is deliberately absent. It is a script-bearing document, and no artwork
 * anyone has sent this works has been one.
 */
export const ARTWORK_TYPES = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/tiff': ['.tif', '.tiff'],
  'application/pdf': ['.pdf'],
  /** Illustrator and EPS. */
  'application/postscript': ['.ai', '.eps'],
  /** CorelDRAW, which most of the trade in Sangamner still draws in. */
  'application/x-coreldraw': ['.cdr'],
  /** A packaged job: the artwork plus its fonts and linked images. */
  'application/zip': ['.zip'],
} as const satisfies Record<string, readonly string[]>;

export type ArtworkContentType = keyof typeof ARTWORK_TYPES;

/** Every extension, for the file picker's `accept`. */
export const ARTWORK_EXTENSIONS: readonly string[] = Object.values(ARTWORK_TYPES).flat();

/** What the picker offers: the extensions, since the types are unreliable. */
export const ARTWORK_ACCEPT = ARTWORK_EXTENSIONS.join(',');

/** The extension, lowercased and with its dot, or '' when there is none. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot).toLowerCase();
}

/**
 * The type a file will be stored as.
 *
 * The extension wins where it is known, because it is the half the office
 * controls; the browser's guess is used only where the extension says nothing.
 * Returns null when neither identifies an accepted format, which is what the
 * upload refuses on.
 */
export function resolveContentType(
  filename: string,
  browserType: string | null | undefined,
): ArtworkContentType | null {
  const extension = extensionOf(filename);

  for (const [type, extensions] of Object.entries(ARTWORK_TYPES)) {
    if ((extensions as readonly string[]).includes(extension)) return type as ArtworkContentType;
  }

  const guess = (browserType ?? '').split(';')[0]?.trim().toLowerCase();
  if (guess && guess in ARTWORK_TYPES) return guess as ArtworkContentType;

  return null;
}

/** Whether a browser will draw this in an `<img>` — decides thumbnail or icon. */
export function isPreviewable(contentType: string): boolean {
  /*
   * TIFF is an image and is not previewable: Chrome and Firefox both refuse to
   * decode it. Listing it here would give the office a broken thumbnail on the
   * one format their designer sends most often after PDF.
   */
  return (
    contentType === 'image/png' || contentType === 'image/jpeg' || contentType === 'image/webp'
  );
}

/** A short label for the file list — 'PDF', 'CDR', 'JPG'. */
export function formatKind(filename: string, contentType: string): string {
  const extension = extensionOf(filename);
  if (extension) return extension.slice(1).toUpperCase();
  return contentType.split('/')[1]?.toUpperCase() ?? 'FILE';
}

/** '2.4 MB'. Bytes are what R2 reports; nobody reads bytes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/**
 * A filename safe to put in a URL and an object key.
 *
 * Artwork arrives named things like `Krishna Dairy 500ml (final) v2.pdf`, and
 * the original is kept for display — this is only what the stored object is
 * called, so a key never has to be escaped by whoever reads the bucket.
 */
export function safeFilename(filename: string): string {
  const extension = extensionOf(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  const cleaned = stem
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return `${cleaned || 'file'}${extension}`;
}
