import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../utils/api-response.js';
import { verifyCredentials } from '../auth/auth.service.js';
import { renderMonitorPage } from './monitor-page.js';
import { DEFAULT_HISTORY_LIMIT, getMonitorSnapshot } from './monitor.service.js';

/*
 * HTTP Basic, not a bearer token.
 *
 * The page is opened by hand in a browser, not by the app, so there is nowhere
 * for a session token to come from — but every browser knows how to answer a
 * Basic challenge with a prompt, and then repeats the credentials by itself on
 * every refresh. That means no new password, no new environment variable and
 * no secret in the URL: an administrator signs in with the account they already
 * have. The trade is that the browser holds those credentials until it is
 * closed, so this belongs on a trusted machine.
 */
const REALM = 'Basic realm="Yuva Polyprint monitor", charset="UTF-8"';

function challenge(res: Response): void {
  res.setHeader('WWW-Authenticate', REALM);
  res.status(401).type('text/plain').send('Administrator sign-in required.');
}

interface Credentials {
  username: string;
  password: string;
}

function parseBasic(header: string | undefined): Credentials | null {
  if (!header) return null;

  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'basic') return null;

  const decoded = Buffer.from(value.trim(), 'base64').toString('utf8');
  // A password may legitimately contain ':' — only the first one separates.
  const separator = decoded.indexOf(':');
  if (separator === -1) return null;

  return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

/**
 * Answers a request with no credentials before the rate limiter sees it.
 *
 * A browser never sends Basic credentials until it has been challenged, so the
 * first request of every visit is unauthenticated by design. Counting those as
 * failed attempts would lock the page after a handful of ordinary visits.
 */
export function requireChallenge(req: Request, res: Response, next: NextFunction): void {
  if (parseBasic(req.headers.authorization) === null) {
    challenge(res);
    return;
  }
  next();
}

/** The monitor page itself. Administrators only. */
export async function monitor(req: Request, res: Response): Promise<void> {
  const credentials = parseBasic(req.headers.authorization);
  if (!credentials) {
    challenge(res);
    return;
  }

  // Usernames are stored lower-case, so "Sudeep" and "sudeep" are one account.
  const user = await verifyCredentials(
    credentials.username.trim().toLowerCase(),
    credentials.password,
  );
  if (!user || !user.isAdmin) {
    challenge(res);
    return;
  }

  /*
   * ?limit= how many sign-ins of history to show. Anything unparseable falls
   * back to the default rather than erroring — this page is typed by hand into
   * an address bar, and a typo should still render something useful. The
   * service clamps the value to its own ceiling.
   */
  const requested = Number(req.query.limit);
  const snapshot = await getMonitorSnapshot(
    Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_HISTORY_LIMIT,
  );

  /*
   * Overrides helmet's default policy for this one response. The page has no
   * scripts and no external assets, but it does style itself inline, which the
   * default style-src would block.
   */
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  // ?format=json for anything that wants to read this with a script rather
  // than a browser. Same envelope as the rest of the API.
  if (req.query.format === 'json') {
    ok(res, snapshot);
    return;
  }

  res.type('html').send(renderMonitorPage(snapshot));
}
