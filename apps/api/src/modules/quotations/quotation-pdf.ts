import puppeteer, { type Browser } from 'puppeteer';
import type { Quotation } from '@yuva/shared';
import { logger } from '../../lib/logger.js';
import { renderQuotationHtml } from './quotation-document.js';

/**
 * One shared browser for the process. Launching Chromium takes seconds, so
 * doing it per request would make every download feel broken.
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

export async function renderQuotationPdf(quotation: Quotation): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(renderQuotationHtml(quotation), { waitUntil: 'load' });

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
