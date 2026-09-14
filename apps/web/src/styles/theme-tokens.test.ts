import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A colour class naming a shade the theme does not define is silent.**
 *
 * Tailwind v4 generates a utility only where a `--color-*` token exists, and
 * generates nothing at all where one does not — no warning at build, no error
 * in the console, no fallback in the browser. The element simply keeps whatever
 * it would have had. So `text-danger-700` in a modal's error line inherits body
 * grey and the error does not read as an error, which is exactly the sort of
 * defect that survives every review: it is invisible in the editor, invisible
 * in the diff, and looks deliberate on screen.
 *
 * Found the hard way. The palette carried 50/500/600 for the status colours and
 * 50/100/500/600/700 for the brand, while the app reached for twelve shades
 * outside that — `text-danger-700` alone in fourteen files, plus the amber
 * pills' `bg-warning-100` and the GSTIN badge's `text-success-800`. Forty-six
 * dead classes in all.
 *
 * The ramps are complete now, so this should stay green. It exists for the next
 * palette: add a family with three shades in it and this fails the moment
 * somebody writes a fourth.
 */

/* Vitest runs from the workspace root. `import.meta.url` is not a file: URL
   under the jsdom environment, so the paths come off the working directory. */
const SRC = resolve(process.cwd(), 'src');
const THEME = join(SRC, 'styles', 'index.css');

/** Every utility prefix Tailwind resolves against a `--color-*` token. */
const PREFIX =
  '(?:bg|text|border|ring|outline|decoration|divide|from|via|to|shadow|accent|caret|fill|stroke|placeholder)';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('the theme palette', () => {
  const css = readFileSync(THEME, 'utf8');
  const defined = new Set(
    [...css.matchAll(/--color-([a-z]+)-(\d+):/g)].map((m) => `${m[1]}-${m[2]}`),
  );
  const families = [...new Set([...defined].map((token) => token.split('-')[0]))];

  it('is reading the files it thinks it is', () => {
    // Without this a moved stylesheet would make the scan below pass by
    // matching nothing, which is the one way a guard can lie.
    expect(existsSync(THEME)).toBe(true);
    expect(defined.size).toBeGreaterThan(20);
  });

  it('defines the families the app is built on', () => {
    // A guard on the guard: if the names ever change, the scan below would
    // quietly match nothing and pass while every class was dead.
    expect(families.sort()).toEqual(['brand', 'danger', 'ink', 'success', 'warning']);
  });

  it('defines every shade the app actually uses', () => {
    const pattern = new RegExp(`\\b${PREFIX}-(${families.join('|')})-(\\d+)\\b`, 'g');
    const missing = new Map<string, string[]>();

    for (const path of sourceFiles(SRC)) {
      for (const match of readFileSync(path, 'utf8').matchAll(pattern)) {
        const token = `${match[1]}-${match[2]}`;
        if (defined.has(token)) continue;
        missing.set(token, [...(missing.get(token) ?? []), path.slice(SRC.length + 1)]);
      }
    }

    /*
     * Named, not counted. "3 missing tokens" sends somebody hunting; the token
     * and the files that want it is the whole fix.
     */
    expect(
      [...missing].map(
        ([token, files]) => `${token} — wanted by ${[...new Set(files)].join(', ')}`,
      ),
    ).toEqual([]);
  });
});
