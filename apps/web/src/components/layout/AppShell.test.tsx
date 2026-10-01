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

/**
 * **The sidebar and `docs/flow.md` describe the same six groups.**
 *
 * They stopped agreeing. "Every screen, and what it is for" in the doc files
 * Machines and Employees under **Resources** and Designs under **Commercial**;
 * the sidebar had no Resources group at all — Designs had been appended to
 * Production when it was built, and Machines and Employees were sitting there
 * with it. Nothing broke, which is why it went unnoticed: a reader following
 * the doc simply could not find the group it told them to look in.
 *
 * The doc is the one somebody reads while learning the system, so it is the
 * side this test takes.
 */
describe('the sidebar matches the documented grouping', () => {
  const NAV = SOURCE.slice(SOURCE.indexOf('const NAV'), SOURCE.indexOf('export function AppShell'));

  /** Group name → the `to` paths listed under it, in order. */
  function groups(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    /* Deliberately crude: the comments between items carry `/` characters, so
       match the route literals rather than trying to parse the object. */
    for (const chunk of NAV.split(/group: '/).slice(1)) {
      const name = chunk.slice(0, chunk.indexOf("'"));
      out.set(
        name,
        [...chunk.matchAll(/to: '([^']+)'/g)].map((m) => m[1] ?? ''),
      );
    }
    return out;
  }

  /** The routes under one group — and proof that group is there at all. */
  function routesUnder(name: string): string[] {
    const found = groups().get(name);
    expect(found, `the sidebar has a ${name} group`).toBeDefined();
    return found ?? [];
  }

  it('has the six groups the doc lists, in the doc order', () => {
    expect([...groups().keys()]).toEqual([
      'Overview',
      'Commercial',
      'Materials',
      'Production',
      'Resources',
      'Administration',
    ]);
  });

  it('keeps Designs with Customers and not with the job screens', () => {
    const commercial = routesUnder('Commercial');
    /* Its question is whose artwork this is, and it is gated on `customers`. */
    expect(commercial).toContain('/designs');
    expect(routesUnder('Production')).not.toContain('/designs');
    /* Next to the customer it belongs to. */
    expect(commercial.indexOf('/designs')).toBe(commercial.indexOf('/customers') + 1);
  });

  it('keeps Machines and Employees under Resources', () => {
    expect(routesUnder('Resources')).toEqual(['/machines', '/employees']);
    const production = routesUnder('Production');
    expect(production).not.toContain('/machines');
    expect(production).not.toContain('/employees');
  });

  it('leaves the machine screen out of the sidebar', () => {
    /* `/floor` is bookmarked on the tablet. The doc says so under "Machine
       screen"; putting it in the sidebar would invite the office to open it. */
    expect(NAV).not.toContain("'/floor'");
  });
});
