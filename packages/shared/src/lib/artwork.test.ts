import { describe, expect, it } from 'vitest';
import {
  ARTWORK_ACCEPT,
  extensionOf,
  formatBytes,
  isPreviewable,
  resolveContentType,
  safeFilename,
} from './artwork.js';

/**
 * The rules here exist because of what browsers actually send, not because of
 * what the specifications say they should. Each case below is a real one.
 */
describe('resolveContentType', () => {
  it('trusts the extension over the browser for an Illustrator file', () => {
    /*
     * An `.ai` **is** a PDF, so Chrome reports it as one. Believing that would
     * file the designer's working file as a proof and offer to open it in a
     * tab, where it renders as whatever PDF preview Illustrator embedded.
     */
    expect(resolveContentType('krishna-dairy.ai', 'application/pdf')).toBe(
      'application/postscript',
    );
  });

  it('recognises a CorelDRAW file the browser has no name for', () => {
    // Chrome sends `.cdr` as application/octet-stream, which is not accepted.
    expect(resolveContentType('pouch-500ml.cdr', 'application/octet-stream')).toBe(
      'application/x-coreldraw',
    );
  });

  it('falls back to the browser when the file has no extension', () => {
    expect(resolveContentType('scan', 'image/png')).toBe('image/png');
  });

  it('ignores a charset the browser appended', () => {
    expect(resolveContentType('scan', 'application/pdf; charset=binary')).toBe('application/pdf');
  });

  it('refuses anything neither half recognises', () => {
    expect(resolveContentType('macro.exe', 'application/octet-stream')).toBeNull();
    expect(resolveContentType('sheet.xlsx', '')).toBeNull();
  });

  it('refuses SVG, which is a document that can carry script', () => {
    expect(resolveContentType('logo.svg', 'image/svg+xml')).toBeNull();
  });

  it('is case-insensitive about the extension', () => {
    expect(resolveContentType('ARTWORK.PDF', '')).toBe('application/pdf');
  });
});

describe('isPreviewable', () => {
  it('leaves TIFF out, because no browser draws one', () => {
    /*
     * TIFF is an image and would look previewable to any rule written from the
     * type alone. Chrome and Firefox both refuse to decode it, so listing it
     * would give a broken thumbnail on the format designers send most after
     * PDF.
     */
    expect(isPreviewable('image/tiff')).toBe(false);
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('application/pdf')).toBe(false);
  });
});

describe('safeFilename', () => {
  it('keeps the extension while making the name key-safe', () => {
    expect(safeFilename('Krishna Dairy 500ml (final) v2.pdf')).toBe(
      'Krishna-Dairy-500ml-final-v2.pdf',
    );
  });

  it('never produces an empty name', () => {
    expect(safeFilename('!!!.pdf')).toBe('file.pdf');
  });

  it('leaves a name with no extension alone rather than inventing one', () => {
    expect(safeFilename('scan')).toBe('scan');
  });
});

describe('extensionOf', () => {
  it('is empty for a dotfile, which has no extension', () => {
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('artwork.')).toBe('');
    expect(extensionOf('a.b.pdf')).toBe('.pdf');
  });
});

describe('formatBytes', () => {
  it('reads the way the office would say it', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(formatBytes(41 * 1024 * 1024)).toBe('41 MB');
  });
});

describe('ARTWORK_ACCEPT', () => {
  it('offers the trade formats, since the picker filters on extension', () => {
    for (const extension of ['.pdf', '.cdr', '.ai', '.eps', '.tif', '.zip']) {
      expect(ARTWORK_ACCEPT).toContain(extension);
    }
  });
});
