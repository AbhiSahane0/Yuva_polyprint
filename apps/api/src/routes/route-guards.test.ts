import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * **Every route that changes something is behind a guard.**
 *
 * Found by auditing the whole surface rather than by reading one file:
 * `PATCH /settings` sat behind nothing but a login, and the settings it
 * writes — the default margin, the wastage allowance, the GSM assumptions,
 * the rate model, the works' day cost — price every quotation raised
 * afterwards. The Costing routes beside it required `rates` for exactly that
 * reason. One of the two was protected.
 *
 * The check is whole-surface on purpose. A guard missing from a single route
 * is invisible in that file's own diff; it is only obvious in a list.
 */
const MODULES = fileURLToPath(new URL('../modules', import.meta.url));

/** Mutating routes that are deliberately open, and why. */
const OPEN: Record<string, string> = {
  'auth POST /login': 'signing in cannot require being signed in',
  'auth POST /logout': 'ending a session you already hold',
  /*
   * A POST that writes nothing. The costing workbook is a calculator: the
   * whole calculation travels in the body and an xlsx comes back, because
   * what is on screen is what downloads. Checked — it touches no table.
   * Anyone who can read a rate can export the working behind it.
   */
  'costing POST /workbook': 'an export, not a write — reads nothing, stores nothing',
};

/** Routers that guard themselves with `router.use(...)` rather than per route. */
function routerLevelGuard(source: string): boolean {
  return /router\.use\((?:[^)]*?)(requireAdmin|requireModule)/.test(source);
}

/** Mount-level guards in routes/index.ts, e.g. `/customers` needs `customers`. */
const INDEX = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');
function mountGuarded(moduleDir: string): boolean {
  /* Match the import name back to its mount line and look for requireModule
     on the same `router.use(...)`. */
  const importLine = new RegExp(`import (\\w+) from '\\.\\./modules/${moduleDir}/[^']+'`).exec(
    INDEX,
  );
  if (!importLine) return false;
  /* `[^;]` not `[^)]`: the mount line contains `requireModule('customers')`,
     and a character class excluding `)` cannot cross its closing bracket. */
  const mount = new RegExp(`router\\.use\\([^;]*${importLine[1]}[^;]*\\);`).exec(INDEX);
  return Boolean(mount && /requireModule|requireAdmin/.test(mount[0]));
}

describe('the mutating surface', () => {
  const unguarded: string[] = [];

  for (const dir of readdirSync(MODULES, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const files = readdirSync(join(MODULES, dir.name)).filter((f) => f.endsWith('.routes.ts'));
    for (const file of files) {
      const source = readFileSync(join(MODULES, dir.name, file), 'utf8');
      const selfGuarded = routerLevelGuard(source);
      const atMount = mountGuarded(dir.name);

      for (const m of source.matchAll(
        /router\.(post|patch|put|delete)\(\s*'([^']*)'(.*?)\n\);/gs,
      )) {
        const key = `${dir.name} ${m[1]!.toUpperCase()} ${m[2]}`;
        if (key in OPEN) continue;
        const guarded = selfGuarded || atMount || /requireModule|requireAdmin/.test(m[3]!);
        if (!guarded) unguarded.push(key);
      }
    }
  }

  it('leaves nothing that writes behind a bare login', () => {
    expect(unguarded, `unguarded: ${unguarded.join(', ')}`).toEqual([]);
  });

  it('found routes to check at all', () => {
    // Guards the guard: a regex that matches nothing would pass silently.
    const total = readdirSync(MODULES, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) =>
        readdirSync(join(MODULES, d.name)).filter((f) => f.endsWith('.routes.ts')),
      ).length;
    expect(total).toBeGreaterThan(15);
  });
});
