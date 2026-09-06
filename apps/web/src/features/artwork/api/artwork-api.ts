import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Artwork,
  ArtworkFile,
  ArtworkLink,
  ArtworkUploadTicket,
  RequestArtworkUploadInput,
  UpdateArtworkInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';

export const artworkKeys = {
  all: ['artwork'] as const,
  job: (jobId: string, includeArchived: boolean) =>
    [...artworkKeys.all, 'job', jobId, includeArchived] as const,
};

export function useJobArtwork(jobId: string | null, includeArchived = false) {
  return useQuery({
    queryKey: artworkKeys.job(jobId ?? '', includeArchived),
    queryFn: () =>
      request<ArtworkFile[]>({
        url: `/artwork/job/${jobId}`,
        method: 'GET',
        params: includeArchived ? { includeArchived: 'true' } : {},
      }),
    enabled: Boolean(jobId),
    /*
     * The thumbnail URLs in this response expire in five minutes. Refetching
     * inside that window is what keeps a screen left open from filling with
     * broken images.
     */
    staleTime: 3 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: artworkKeys.all });
}

/**
 * Puts one file into Cloudflare, in the three steps the API is shaped around:
 * sign, PUT, confirm.
 *
 * The middle step is a bare XHR rather than the app's axios client on purpose.
 * The client attaches an Authorization header to everything, and a presigned
 * URL already carries its authorisation in the query string — R2 answers 400
 * when both arrive. XHR rather than fetch because it reports progress, and a
 * 40 MB artwork over the works' connection is a minute of nothing to look at
 * otherwise.
 */
async function putToStorage(
  ticket: ArtworkUploadTicket,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl, true);
    for (const [header, value] of Object.entries(ticket.headers)) {
      xhr.setRequestHeader(header, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      /*
       * The two that happen in practice: 403 when the clock is off or the key
       * is wrong, and a status of 0 when the bucket's CORS rules do not allow
       * this origin — the browser blocks the response and reports nothing.
       */
      reject(
        new Error(
          xhr.status === 0
            ? 'The upload was blocked by the storage bucket. Its CORS rules need to allow this site.'
            : `Storage refused the upload (${xhr.status}).`,
        ),
      );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          'The upload could not reach storage. Check the connection and the bucket CORS rules.',
        ),
      );
    xhr.onabort = () => reject(new Error('Upload cancelled'));

    xhr.send(file);
  });
}

/** The File carries its own name, type and size, so none of those are asked for. */
export interface UploadArtworkInput extends Omit<
  RequestArtworkUploadInput,
  'filename' | 'contentType' | 'sizeBytes'
> {
  file: File;
  onProgress?: (fraction: number) => void;
}

export function useUploadArtwork() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async ({ file, onProgress, ...rest }: UploadArtworkInput): Promise<Artwork> => {
      const ticket = await request<ArtworkUploadTicket>({
        url: '/artwork/uploads',
        method: 'POST',
        data: { ...rest, filename: file.name, contentType: file.type, sizeBytes: file.size },
      });

      await putToStorage(ticket, file, onProgress ?? (() => {}));

      /*
       * The row stays PENDING until this succeeds, and a PENDING row that is
       * never confirmed ages out of the list on its own — so a browser closed
       * mid-upload leaves a record that disappears rather than a half-file
       * that looks real.
       */
      return request<Artwork>({ url: `/artwork/${ticket.artwork.id}/confirm`, method: 'POST' });
    },
    onSuccess: invalidate,
  });
}

/** A short-lived signed URL. Fetched on click, never held. */
export async function artworkLink(id: string, download: boolean): Promise<string> {
  const link = await request<ArtworkLink>({
    url: `/artwork/${id}/link`,
    method: 'GET',
    params: download ? { download: '1' } : {},
  });
  return link.url;
}

export function useUpdateArtwork() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateArtworkInput & { id: string }) =>
      request<Artwork>({ url: `/artwork/${id}`, method: 'PATCH', data: input }),
    onSuccess: invalidate,
  });
}

export function useRemoveArtwork() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => request<Artwork>({ url: `/artwork/${id}`, method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/**
 * Erases the file for good. The row stays, marked deleted, with who and when.
 *
 * A different endpoint from remove rather than a flag, so nothing about this
 * call can be mistaken for the reversible one.
 */
export function usePurgeArtwork() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => request<Artwork>({ url: `/artwork/${id}/file`, method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useRestoreArtwork() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => request<Artwork>({ url: `/artwork/${id}/restore`, method: 'POST' }),
    onSuccess: invalidate,
  });
}
