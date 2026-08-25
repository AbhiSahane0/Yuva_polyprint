import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../lib/logger.js';

/**
 * Letterhead artwork, inlined as data URIs.
 *
 * The PDF is rendered from an HTML string with no network access, so every
 * image has to be embedded. Files are read once at startup and cached — they
 * change about as often as the company letterhead does.
 */

const here = dirname(fileURLToPath(import.meta.url));
// Resolves under both src (tsx) and dist (node) layouts.
const ASSET_DIRS = [
  resolve(here, '../../../assets/quotation'),
  resolve(here, '../../../../assets/quotation'),
];

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/**
 * Width/height of a PNG or JPEG, straight from the file header.
 *
 * The letterhead bands have to reserve exactly the right vertical space on the
 * page. Guessing a height would either clip the artwork or leave a gap, so the
 * real aspect ratio is read from the image itself.
 */
function readImageSize(buffer: Buffer): { width: number; height: number } | null {
  // PNG: IHDR width/height are big-endian uint32 at bytes 16 and 20.
  if (buffer.length > 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // JPEG: walk the segment markers to the start-of-frame.
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF0-SOF3 and SOF5-SOF15 carry the dimensions; skip DHT/DAC/RST markers.
      if (
        marker !== undefined &&
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  return null;
}

interface LoadedAsset {
  dataUri: string;
  /** height / width — used to work out the band's printed height. */
  aspect: number | null;
}

function loadAsset(baseName: string): LoadedAsset | null {
  for (const dir of ASSET_DIRS) {
    for (const [ext, mime] of Object.entries(MIME)) {
      const path = resolve(dir, `${baseName}${ext}`);
      if (!existsSync(path)) continue;
      try {
        const buffer = readFileSync(path);
        const size = readImageSize(buffer);
        logger.info(
          `Quotation asset loaded: ${baseName}${ext}${size ? ` (${size.width}x${size.height})` : ''}`,
        );
        return {
          dataUri: `data:${mime};base64,${buffer.toString('base64')}`,
          aspect: size && size.width > 0 ? size.height / size.width : null,
        };
      } catch (error) {
        logger.warn({ err: error }, `Could not read quotation asset ${path}`);
      }
    }
  }
  return null;
}

export interface QuotationAssets {
  header: LoadedAsset | null;
  footer: LoadedAsset | null;
  paymentQr: LoadedAsset | null;
}

let cached: QuotationAssets | null = null;

export function getQuotationAssets(): QuotationAssets {
  if (cached) return cached;

  cached = {
    header: loadAsset('header'),
    footer: loadAsset('footer'),
    paymentQr: loadAsset('payment-qr'),
  };

  if (!cached.header && !cached.footer) {
    logger.warn(
      'No quotation letterhead artwork found in assets/quotation — falling back to the CSS letterhead',
    );
  }
  return cached;
}

/** Clears the cache so new artwork is picked up without a restart. */
export function reloadQuotationAssets(): QuotationAssets {
  cached = null;
  return getQuotationAssets();
}
