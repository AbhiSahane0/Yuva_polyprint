import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { requestBlob, ApiClientError } from '@/lib/api-client';
import { saveBlob } from '@/lib/download';
import { toast } from '@/lib/toast';

/**
 * **This list, as a spreadsheet.**
 *
 * The works asked for it on every page, and the reason is the same each time: a
 * figure that can only be read on a screen cannot be taken to a meeting,
 * pinned up beside a machine, sent to an accountant or checked against last
 * month's. "Print today's rates" is not reporting, it is how the office works.
 *
 * **What is on screen is what downloads.** The same filters go up with the
 * request, and the file says in its header which ones they were — a
 * spreadsheet of forty rows out of four hundred, with nothing to say which
 * forty, gets filed and then disbelieved. It is not paginated either: the
 * screen stops at twenty-five because a screen has to, and a file holding page
 * one of nine is worse than no file.
 *
 * A button rather than a link, like the PDF buttons beside it: the endpoint
 * needs a session and the token travels in a header, which a browser
 * navigation cannot carry. So it is fetched by script and handed to the page.
 */
export function ExportButton({
  /** The list endpoint's export path, e.g. `/materials/export`. */
  path,
  /** The filters currently on screen. Undefined and empty values are dropped. */
  params,
  label = 'Export',
  disabled,
}: {
  path: string;
  params?: Record<string, string | number | boolean | undefined | null>;
  label?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const clean = Object.fromEntries(
        Object.entries(params ?? {}).filter(
          ([, value]) => value !== undefined && value !== null && value !== '',
        ),
      );
      const { blob, filename } = await requestBlob({ url: path, method: 'GET', params: clean });
      /* The server names it, dated, because the office keeps these. */
      saveBlob(blob, filename ?? 'Export.xlsx');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'That could not be exported');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" onClick={download} loading={busy} disabled={disabled || busy}>
      <Download className="size-4" />
      {label}
    </Button>
  );
}
