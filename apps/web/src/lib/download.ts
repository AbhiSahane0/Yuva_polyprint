/**
 * Handing a fetched file to the browser.
 *
 * Needed because authenticated files cannot be plain links — the session token
 * travels in a header, and a browser navigation cannot carry one. So the file
 * is fetched by script and given to the page as a blob instead.
 *
 * Every object URL created here is revoked. They pin the whole file in memory
 * until the document unloads otherwise, and a quotation PDF is close to a
 * megabyte.
 */

/** Saves a blob to disk under `filename`. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // The click is synchronous, but the browser reads the URL just after it, so
  // give up the reference on the next tick rather than immediately.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Opens an already-fetched blob in a new tab.
 *
 * Takes the URL rather than making one, so the caller can keep a single object
 * URL alive for a preview and reuse it here — regenerating a PDF that is
 * already on screen would mean waiting for the server all over again.
 *
 * Returns false when a popup blocker refuses, so the caller can say so instead
 * of appearing to do nothing.
 */
export function openBlobUrl(url: string): boolean {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  return opened !== null;
}
