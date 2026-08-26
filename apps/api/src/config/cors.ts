/**
 * Origin matching for CORS, with wildcard support.
 *
 * Vercel gives every preview deployment its own hostname —
 * `app-git-my-branch-me.vercel.app`, a fresh one per branch and per commit — so
 * an exact allowlist can never cover them. A pattern can:
 *
 *   CORS_ORIGINS=https://yuva-polyprint.vercel.app,https://yuva-polyprint-*.vercel.app
 *
 * `*` matches any run of characters except a dot or a slash, so it stays inside
 * one hostname label. `https://yuva-polyprint-*.vercel.app` therefore matches
 * `https://yuva-polyprint-git-main-me.vercel.app` but not
 * `https://yuva-polyprint-x.attacker.com`.
 *
 * Keep the project name in the pattern. `https://*.vercel.app` would let any
 * site anyone deploys on Vercel call this API with credentials attached.
 */

/** Escapes a pattern for use in a RegExp, leaving `*` as the one wildcard. */
function toRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^./]*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Builds a predicate over the allowed origins. Exact entries are matched by
 * string equality; only entries containing `*` become patterns, so the common
 * case stays a plain comparison.
 */
export function createOriginMatcher(patterns: string[]): (origin: string) => boolean {
  const exact = new Set(patterns.filter((pattern) => !pattern.includes('*')));
  const globs = patterns.filter((pattern) => pattern.includes('*')).map(toRegExp);

  return (origin: string) =>
    exact.has(origin) || globs.some((expression) => expression.test(origin));
}
