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
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
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

    // Final top-up once layout is completely settled, so the PDF and the
    // on-screen preview agree on how many rows fit. Passed as a string because
    // this file is typed for Node and has no DOM lib.
    await page.evaluate('window.__fillSheet && window.__fillSheet()');

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
