/**
 * Formatting for the sign-in screen.
 *
 * India Standard Time throughout, and stated as such on the page. The office
 * reads these to answer "was that this morning?", and a browser set to another
 * zone — a laptop that travelled, a machine with the wrong clock region —
 * would quietly answer a different question.
 */

/** India has never observed daylight saving, so this is exact for every date. */
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

/** `27 Aug 2026, 6:42 pm` in IST. */
export function formatIst(iso: string | null): string {
  if (!iso) return '—';

  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = MONTHS[ist.getUTCMonth()];
  const minute = String(ist.getUTCMinutes()).padStart(2, '0');
  const rawHour = ist.getUTCHours();
  const meridiem = rawHour < 12 ? 'am' : 'pm';
  const hour = rawHour % 12 || 12;

  return `${day} ${month} ${ist.getUTCFullYear()}, ${hour}:${minute} ${meridiem}`;
}

/** Just the day, for grouping a long list. */
export function formatIstDay(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/** How long ago, in words. The exact time is always shown beside it. */
export function formatAgo(iso: string | null, now: Date): string {
  if (!iso) return 'never signed in';

  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * A short label for a user agent — "Chrome on Windows", "Safari on iOS".
 *
 * A guess from a handful of well-known tokens and nothing more, so it says
 * nothing at all rather than something wrong when it does not recognise the
 * string. The raw header is kept in the database either way.
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
