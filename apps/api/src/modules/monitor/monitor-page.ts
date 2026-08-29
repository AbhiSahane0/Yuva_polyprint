import type { MonitorSnapshot } from './monitor.service.js';

/**
 * The monitor page: one self-contained HTML document, no scripts, no assets.
 *
 * It is opened by hand in a browser rather than by the app, so it carries its
 * own styling inline — there is no bundle to load it from, and the response
 * sets a content-security-policy that forbids anything external.
 */

/**
 * India has never observed daylight saving, so +05:30 is exact for every date
 * that has ever been stored. Applying it by hand rather than through Intl keeps
 * the output identical regardless of whether the container image ships a full
 * ICU build — Alpine has historically shipped a trimmed one.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `27 Aug 2026, 6:42 pm` — IST, always. */
export function formatIst(date: Date | null): string {
  if (!date) return '—';

  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = MONTHS[ist.getUTCMonth()];
  const minute = String(ist.getUTCMinutes()).padStart(2, '0');
  const rawHour = ist.getUTCHours();
  const meridiem = rawHour < 12 ? 'am' : 'pm';
  const hour = rawHour % 12 || 12;

  return `${day} ${month} ${ist.getUTCFullYear()}, ${hour}:${minute} ${meridiem}`;
}

/** How long ago, in words. The exact timestamp is alongside it in every table. */
export function formatAgo(date: Date | null, now: Date): string {
  if (!date) return 'never signed in';

  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * A short label for a user agent — Chrome on Windows, Safari on iOS, and so on.
 *
 * It is a guess from a handful of well-known tokens and nothing more, so it
 * says nothing at all rather than something wrong when the string is not one it
 * recognises. The header is stored whole; `?format=json` returns it verbatim.
 *
 * Order matters: Edge and Opera both claim to be Chrome, and Chrome claims to
 * be Safari, so the most specific test has to come first.
 */
export function describeAgent(userAgent: string | null): string {
  if (!userAgent) return '—';

  const browsers: [RegExp, string][] = [
    [/Edg\//, 'Edge'],
    [/OPR\/|Opera/, 'Opera'],
    [/Chrome\//, 'Chrome'],
    [/Firefox\//, 'Firefox'],
    [/Safari\//, 'Safari'],
    [/curl\//, 'curl'],
  ];
  const platforms: [RegExp, string][] = [
    [/Android/, 'Android'],
    [/iPhone|iPad|iPod/, 'iOS'],
    [/Windows/, 'Windows'],
    [/Mac OS X|Macintosh/, 'Mac'],
    [/Linux/, 'Linux'],
  ];

  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? '';
  const platform = platforms.find(([pattern]) => pattern.test(userAgent))?.[1] ?? '';

  if (browser && platform) return `${browser} on ${platform}`;
  return browser || platform || '—';
}

/** Escapes user-supplied text — display names and usernames are typed by hand. */
function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 64px;
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #16181d; background: #f6f7f9;
  }
  main { max-width: 940px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: -0.01em; }
  h2 { margin: 36px 0 10px; font-size: 15px; text-transform: uppercase;
       letter-spacing: 0.06em; color: #6b7280; font-weight: 600; }
  .meta { margin: 0; color: #6b7280; font-size: 13px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { padding: 10px 14px; text-align: left; white-space: nowrap; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;
       color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb; }
  td { border-top: 1px solid #f1f2f4; }
  tbody tr:first-child td { border-top: none; }
  .name { font-weight: 600; }
  .sub { color: #6b7280; font-size: 13px; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 999px;
         font-size: 12px; font-weight: 600; }
  .tag-admin { background: #eef2ff; color: #4338ca; }
  .tag-user { background: #f3f4f6; color: #4b5563; }
  .tag-off { background: #fef2f2; color: #b91c1c; }
  .empty { padding: 20px 14px; color: #6b7280; }
  .foot { margin-top: 16px; color: #9ca3af; font-size: 12px; }
  .foot code { font-size: 12px; background: #eef0f3; padding: 1px 5px; border-radius: 4px; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6e7ea; background: #101114; }
    .card { background: #17181c; border-color: #26282e; }
    td { border-top-color: #212329; }
    th { border-bottom-color: #26282e; color: #9096a1; }
    .meta, .sub, .empty { color: #9096a1; }
    .tag-admin { background: #1e1b4b; color: #c7d2fe; }
    .tag-user { background: #24262c; color: #c9ccd3; }
    .tag-off { background: #3f1d1d; color: #fca5a5; }
    .foot code { background: #24262c; }
  }
`;

export function renderMonitorPage(snapshot: MonitorSnapshot): string {
  const { generatedAt, users, sessions } = snapshot;

  const userRows = users
    .map(
      (user) => `
        <tr>
          <td>
            <div class="name">${esc(user.displayName)}</div>
            <div class="sub">${esc(user.username)}</div>
          </td>
          <td>
            ${
              user.isActive
                ? `<span class="tag ${user.isAdmin ? 'tag-admin' : 'tag-user'}">${
                    user.isAdmin ? 'Admin' : 'User'
                  }</span>`
                : '<span class="tag tag-off">Deactivated</span>'
            }
          </td>
          <td>${esc(formatIst(user.lastLoginAt))}</td>
          <td class="sub">${esc(formatAgo(user.lastLoginAt, generatedAt))}</td>
          <td>${user.activeSessions === 0 ? '<span class="sub">—</span>' : esc(user.activeSessions)}</td>
        </tr>`,
    )
    .join('');

  const sessionRows = sessions
    .map(
      (session) => `
        <tr>
          <td>
            <div class="name">${esc(session.displayName)}</div>
            <div class="sub">${esc(session.username)}</div>
          </td>
          <td>${esc(formatIst(session.signedInAt))}</td>
          <td>${esc(formatIst(session.lastSeenAt))}
            <span class="sub">· ${esc(formatAgo(session.lastSeenAt, generatedAt))}</span>
          </td>
          <td class="sub">${esc(formatIst(session.expiresAt))}</td>
        </tr>`,
    )
    .join('');

  const historyRows = snapshot.history
    .map(
      (event) => `
        <tr>
          <td>
            <div class="name">${esc(event.displayName)}${
              event.accountExists ? '' : ' <span class="sub">(account removed)</span>'
            }</div>
            <div class="sub">${esc(event.username)}</div>
          </td>
          <td>${esc(formatIst(event.at))}</td>
          <td class="sub">${esc(formatAgo(event.at, generatedAt))}</td>
          <td class="sub">${esc(event.ipAddress ?? '—')}</td>
          <td class="sub">${esc(describeAgent(event.userAgent))}</td>
        </tr>`,
    )
    .join('');

  const shown = snapshot.history.length;
  const historyNote =
    shown < snapshot.historyTotal
      ? `Showing the ${shown} most recent of ${snapshot.historyTotal} sign-ins. ` +
        `Add <code>?limit=${Math.min(snapshot.historyTotal, 1000)}</code> to the address for more.`
      : `${shown} sign-in${shown === 1 ? '' : 's'} on record — all of them.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign-in monitor — Yuva Polyprint</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <h1>Sign-in monitor</h1>
  <p class="meta">All times India Standard Time. Generated ${esc(formatIst(generatedAt))}.</p>

  <h2>Users — last sign-in</h2>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>User</th><th>Role</th><th>Last sign-in (IST)</th><th></th><th>Signed in now</th>
        </tr>
      </thead>
      <tbody>${userRows}</tbody>
    </table>
  </div>

  <h2>Sessions open now</h2>
  <div class="card">
    ${
      sessions.length === 0
        ? '<p class="empty">Nobody is signed in.</p>'
        : `<table>
      <thead>
        <tr><th>User</th><th>Signed in (IST)</th><th>Last active (IST)</th><th>Expires</th></tr>
      </thead>
      <tbody>${sessionRows}</tbody>
    </table>`
    }
  </div>

  <h2>Sign-in history</h2>
  <div class="card">
    ${
      shown === 0
        ? '<p class="empty">No sign-ins recorded yet.</p>'
        : `<table>
      <thead>
        <tr><th>User</th><th>Signed in (IST)</th><th></th><th>From</th><th>Device</th></tr>
      </thead>
      <tbody>${historyRows}</tbody>
    </table>`
    }
  </div>
  <p class="foot">${historyNote}</p>

  <p class="foot">
    Every successful sign-in is recorded permanently, so the history above goes back
    to the day this was switched on. Sessions expire after seven days and are then
    deleted, so &ldquo;open now&rdquo; only ever shows the current week. Failed attempts
    are not recorded.
  </p>
</main>
</body>
</html>`;
}
