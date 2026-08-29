import { useMemo, useState } from 'react';
import { Activity, Monitor, RefreshCw, ShieldCheck } from 'lucide-react';
import type { MonitorLogin } from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useMonitor } from '../api/monitor-api';
import { describeAgent, formatAgo, formatIst, formatIstDay } from '../lib/format';

/** How many sign-ins to ask for. Matches the API's own ceiling at the top end. */
const PAGE_SIZES = [100, 250, 1000] as const;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-ink-900 text-base font-semibold">{title}</h2>
      <p className="text-ink-500 mt-0.5 mb-3 text-sm">{description}</p>
      <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
        {children}
      </div>
    </section>
  );
}

/**
 * Groups the history by day.
 *
 * A flat list of a few hundred timestamps is unreadable — the question people
 * actually ask is "who was in on Tuesday", and a date heading answers it
 * without them having to compare rows.
 */
function groupByDay(history: MonitorLogin[]): { day: string; events: MonitorLogin[] }[] {
  const groups: { day: string; events: MonitorLogin[] }[] = [];

  for (const event of history) {
    const day = formatIstDay(event.at);
    const last = groups.at(-1);
    if (last && last.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }

  return groups;
}

export default function MonitorPage() {
  const [limit, setLimit] = useState<number>(PAGE_SIZES[0]);
  const { data, isPending, isError, error, refetch, isFetching } = useMonitor(limit);

  // One clock for the whole render, so two rows cannot say "5 min" and "6 min"
  // about the same instant.
  const now = useMemo(() => (data ? new Date(data.generatedAt) : new Date()), [data]);
  const days = useMemo(() => (data ? groupByDay(data.history) : []), [data]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Sign-in log</h1>
          <p className="text-ink-500 mt-1 text-sm">
            Who has been using the system, and when. All times India Standard Time
            {data ? ` · read at ${formatIst(data.generatedAt)}` : null}.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
          Refresh
        </Button>
      </header>

      {isError ? (
        <div className="border-ink-200 mt-5 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <EmptyState
            title="Could not load the sign-in log"
            description={error instanceof Error ? error.message : 'Something went wrong.'}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </div>
      ) : isPending ? (
        <div className="border-ink-200 mt-5 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <LoadingState label="Loading sign-ins…" />
        </div>
      ) : (
        <>
          <Section
            title="Accounts"
            description="Every account, with the last time it was used. Most recent first."
          >
            <ul className="divide-ink-100 divide-y">
              {data.users.map((user) => (
                <li
                  key={user.username}
                  className={
                    'flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between ' +
                    (user.isActive ? '' : 'bg-ink-50/60')
                  }
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink-900 text-sm font-semibold">{user.displayName}</span>
                      {user.isAdmin ? (
                        <Badge tone="brand">
                          <ShieldCheck className="mr-1 inline size-3" />
                          Admin
                        </Badge>
                      ) : null}
                      {user.isActive ? null : <Badge tone="warning">Deactivated</Badge>}
                      {user.activeSessions > 0 ? (
                        <Badge tone="success">
                          Signed in
                          {user.activeSessions > 1 ? ` · ${user.activeSessions} devices` : null}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-ink-500 mt-0.5 text-sm">{user.username}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-ink-800 text-sm">{formatIst(user.lastLoginAt)}</p>
                    <p className="text-ink-400 text-xs">{formatAgo(user.lastLoginAt, now)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Signed in now"
            description="Live sessions. One row per browser — signing in on a phone as well makes two."
          >
            {data.sessions.length === 0 ? (
              <EmptyState
                icon={<Monitor className="size-8" />}
                title="Nobody is signed in"
                description="Every session has either been signed out or expired."
              />
            ) : (
              <ul className="divide-ink-100 divide-y">
                {data.sessions.map((session) => (
                  <li
                    key={`${session.username}-${session.signedInAt}`}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-ink-900 text-sm font-semibold">{session.displayName}</p>
                      <p className="text-ink-500 mt-0.5 text-sm">
                        Signed in {formatIst(session.signedInAt)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-ink-800 text-sm">
                        Active {formatAgo(session.lastSeenAt, now)}
                      </p>
                      <p className="text-ink-400 text-xs">Expires {formatIst(session.expiresAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Sign-in history"
            description="Every successful sign-in, newest first. Nothing is ever removed from this list."
          >
            {data.history.length === 0 ? (
              <EmptyState
                icon={<Activity className="size-8" />}
                title="No sign-ins recorded yet"
                description="Sign-ins appear here from the moment they happen."
              />
            ) : (
              <div>
                {days.map((group) => (
                  <div key={group.day}>
                    <p className="border-ink-100 bg-ink-50/70 text-ink-500 border-y px-4 py-1.5 text-xs font-semibold tracking-wide uppercase">
                      {group.day}
                    </p>
                    <ul className="divide-ink-100 divide-y">
                      {group.events.map((event) => (
                        <li
                          key={`${event.username}-${event.at}`}
                          className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-ink-900 text-sm font-semibold">
                                {event.displayName}
                              </span>
                              {event.accountExists ? null : (
                                <Badge tone="neutral">Account removed</Badge>
                              )}
                            </div>
                            <p className="text-ink-500 mt-0.5 text-sm">
                              {describeAgent(event.userAgent)}
                              {event.ipAddress ? ` · ${event.ipAddress}` : null}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-ink-800 text-sm">{formatIst(event.at)}</p>
                            <p className="text-ink-400 text-xs">{formatAgo(event.at, now)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-500 text-sm">
              {data.history.length < data.historyTotal
                ? `Showing the ${data.history.length} most recent of ${data.historyTotal} sign-ins.`
                : `${data.historyTotal} sign-in${data.historyTotal === 1 ? '' : 's'} on record — all of them.`}
            </p>
            {data.historyTotal > PAGE_SIZES[0] ? (
              <div className="flex items-center gap-2">
                <span className="text-ink-500 text-sm">Show</span>
                {PAGE_SIZES.map((size) => (
                  <Button
                    key={size}
                    size="sm"
                    variant={limit === size ? 'primary' : 'secondary'}
                    onClick={() => setLimit(size)}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <p className="text-ink-400 mt-6 text-xs">
            Sign-ins are recorded permanently. Sessions expire after seven days and are then
            deleted, so &ldquo;signed in now&rdquo; only ever covers the current week. Failed
            sign-in attempts are not recorded.
          </p>
        </>
      )}
    </div>
  );
}
