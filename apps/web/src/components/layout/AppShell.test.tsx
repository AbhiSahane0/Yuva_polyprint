import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * **The sidebar must stay reachable as the app grows.**
 *
 * It did not. The footer was `absolute bottom-0` inside a scrolling `aside`,
 * and an absolutely positioned element anchors to the bottom of the
 * **scrollable content**, not the visible panel. While the nav was short
 * enough to fit, it looked pinned and nobody noticed. The day the nav grew
 * past the height of the screen — which is the day Machines was added — the
 * footer began scrolling with the content and sat on top of the last items.
 * Machines could not be reached at all, at any scroll position.
 *
 * Guarded at the source because jsdom does no layout: it will happily report
 * every item as present and 0×0, so a render test cannot see this class of
 * bug. These are the three properties that make the column work.
 */
/* Resolved from the workspace root, as theme-tokens.test.ts does: the web
   tests run in jsdom, where import.meta.url is not a file: URL. */
const SOURCE = readFileSync(
  join(resolve(process.cwd(), 'src'), 'components', 'layout', 'AppShell.tsx'),
  'utf8',
);

/** The opening `<aside ...>` tag within a slice of the file. */
function asideTag(region: string): string {
  const open = region.indexOf('<aside');
  expect(open, 'the region has an <aside>').toBeGreaterThan(-1);
  const close = region.indexOf('>', open);
  return region.slice(open, close);
}

describe('the sidebar is a column of three', () => {
  it('never positions the footer absolutely', () => {
    const footer = SOURCE.slice(
      SOURCE.indexOf('function SessionFooter'),
      SOURCE.indexOf('export function AppShell'),
    );
    expect(footer).not.toContain('absolute');
    /* It holds its place in the column instead. */
    expect(footer).toContain('shrink-0');
  });

  it('scrolls the nav rather than the whole sidebar', () => {
    /*
     * The panel itself must not scroll — if it does, the footer goes with it
     * whatever its position. Exactly one region inside scrolls, and it is the
     * one holding the nav.
     */
    const desktop = SOURCE.slice(
      SOURCE.indexOf('{/* Desktop sidebar */}'),
      SOURCE.indexOf('{/* Mobile drawer */}'),
    );
    const panel = asideTag(desktop);
    expect(panel).toContain('flex-col');
    expect(panel).not.toContain('overflow-y-auto');
    expect(desktop).toContain('min-h-0 flex-1 overflow-y-auto');
  });

  it('gives the mobile drawer the same treatment', () => {
    // Same bug, same fix — a phone has less height, not more.
    const mobile = SOURCE.slice(SOURCE.indexOf('{/* Mobile drawer */}'));
    const panel = asideTag(mobile);
    expect(panel).toContain('flex-col');
    expect(panel).not.toContain('overflow-y-auto');
    expect(mobile).toContain('min-h-0 flex-1 overflow-y-auto');
  });

  it('keeps no bottom padding standing in for a footer', () => {
    /* `pb-28` was the old way of reserving room for the overlaying footer. A
       real column needs no such reservation, and leaving it would put dead
       space under the last item. */
    expect(SOURCE).not.toContain('pb-28');
  });
});
