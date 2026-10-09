import puppeteer, { type Browser } from 'puppeteer';
import { logger } from './logger.js';

/**
 * **Printing a document.**
 *
 * One Chromium for the whole process, shared by every document the API prints
 * — the quotation that goes to a customer and the job card that goes to the
 * floor. Launching it takes seconds, so a browser per request would make every
 * download feel broken, and a browser per DOCUMENT TYPE would hold two of them
 * open to do one job.
 *
 * Templates are rendered from a string with no network access: whatever a
 * document needs — fonts, artwork, the payment QR — has to be inline or a data
 * URI, or it simply will not be there.
 */
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // In the container Puppeteer's bundled Chromium is not downloaded at all —
    // it cannot run on Alpine — so the image installs the system build and
    // points here. Locally the variable is unset and the bundled one is used.
    const executablePath = process.env['PUPPETEER_EXECUTABLE_PATH'];

    browserPromise = puppeteer.launch({
      headless: true,
      // --no-sandbox is required in a container running as an unprivileged
      // user; --disable-dev-shm-usage avoids the small /dev/shm that hosts
      // like Render provide, which otherwise crashes Chromium mid-render.
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      ...(executablePath ? { executablePath } : {}),
    });
  }

  const browser = await browserPromise;
  // A crashed browser must not poison every later request.
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

/**
 * One HTML document as an A4 PDF.
 *
 * `preferCSSPageSize` is what lets a template own its own geometry through
 * `@page` — the margins a document prints at belong to the document, not to
 * this function.
 */
export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await page.close();
  }
}

/** Called on shutdown so Chromium does not outlive the API process. */
export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch (error) {
    logger.warn({ err: error }, 'Failed to close the PDF browser cleanly');
  } finally {
    browserPromise = null;
  }
}
