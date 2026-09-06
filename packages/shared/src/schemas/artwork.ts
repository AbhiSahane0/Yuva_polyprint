import { z } from 'zod';
import {
  ARTWORK_KINDS,
  MAX_ARTWORK_BYTES,
  formatBytes,
  resolveContentType,
} from '../lib/artwork.js';

/**
 * A file the browser is about to upload.
 *
 * Size is checked here as well as against R2 afterwards. This half refuses a
 * 300 MB file before it is sent, which is the difference between a message and
 * ten minutes of a works' broadband.
 */
export const requestArtworkUploadSchema = z
  .object({
    jobId: z.string().min(1, 'Choose a design'),
    filename: z.string().trim().min(1, 'The file needs a name').max(255),
    /** What the browser guessed. Advisory: the extension decides. */
    contentType: z.string().trim().max(200).default(''),
    sizeBytes: z
      .number()
      .int()
      .positive('That file is empty')
      .max(MAX_ARTWORK_BYTES, `Files must be under ${formatBytes(MAX_ARTWORK_BYTES)}`),
    kind: z.enum(ARTWORK_KINDS).default('ARTWORK'),
    notes: z.string().trim().max(500).default(''),
    /**
     * The file this one replaces. Naming it is what makes this a revision
     * rather than a second file: a design legitimately carries a front and a
     * back panel, so nothing is superseded unless somebody says it is.
     */
    replacesId: z.string().min(1).nullable().default(null),
  })
  .refine((value) => resolveContentType(value.filename, value.contentType) !== null, {
    path: ['filename'],
    message: 'That file type is not accepted. Send a PDF, an image, an AI/EPS, a CDR or a ZIP.',
  });

export type RequestArtworkUploadInput = z.infer<typeof requestArtworkUploadSchema>;

/** Editable after the fact. The file itself never changes; its filing does. */
export const updateArtworkSchema = z.object({
  kind: z.enum(ARTWORK_KINDS).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type UpdateArtworkInput = z.infer<typeof updateArtworkSchema>;

export const listArtworkQuerySchema = z.object({
  /** Off by default: the design screen shows what is current, not the archive. */
  includeArchived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
});

export type ListArtworkQuery = z.infer<typeof listArtworkQuerySchema>;
