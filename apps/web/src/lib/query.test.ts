import { describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { settle } from './query';

/**
 * **The contract: a mutation is not finished until the screen is right.**
 *
 * Everything that runs after a save — closing a dialog, clearing a draft,
 * showing a toast — runs when the mutation settles. If the invalidation is not
 * awaited, all of that happens against the PREVIOUS values and the screen
 * corrects itself a moment later. That is the flash.
 *
 * A real `QueryObserver` in each test rather than a bare `fetchQuery`, because
 * `invalidateQueries` only refetches **active** queries — and a test without an
 * observer would pass whether or not the waiting works.
 */
const listKey = ['things', 'list'] as const;

const client = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

describe('settle', () => {
  it('waits for the refetch before it resolves', async () => {
    const queryClient = client();
    let release: (() => void) | null = null;
    let value = 'old';

    const observer = new QueryObserver(queryClient, {
      queryKey: listKey,
      queryFn: async () => {
        if (release) await new Promise<void>((resolve) => (release = resolve));
        return value;
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();
    expect(queryClient.getQueryData(listKey)).toBe('old');

    /* The next fetch hangs until let go, standing in for a slow network. */
    release = () => {};
    value = 'new';

    let settled = false;
    const pending = settle(queryClient, listKey).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    // The whole point: still not settled, so nothing downstream has run yet.
    expect(settled).toBe(false);
    expect(queryClient.getQueryData(listKey)).toBe('old');

    release?.();
    await pending;
    expect(settled).toBe(true);
    // And by the time it IS settled, the screen's data is the new figure.
    expect(queryClient.getQueryData(listKey)).toBe('new');
    unsubscribe();
  });

  it('resolves even when the refetch fails, because the write still happened', async () => {
    const queryClient = client();
    let fail = false;

    const observer = new QueryObserver(queryClient, {
      queryKey: listKey,
      retry: false,
      queryFn: async () => {
        if (fail) throw new Error('network gone');
        return 'old';
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();

    fail = true;
    /*
     * A save that worked must never be reported as a failure because the
     * reading back of it did not. The figure stays stale with nothing to
     * explain it, which is bad — and better than telling somebody their rate
     * did not save when it did, and having them type it in twice.
     */
    await expect(settle(queryClient, listKey)).resolves.toBeUndefined();
    unsubscribe();
  });

  it('waits for every key it was given', async () => {
    const queryClient = client();
    const other = ['other'] as const;
    await queryClient.fetchQuery({ queryKey: listKey, queryFn: async () => 'a' });
    await queryClient.fetchQuery({ queryKey: other, queryFn: async () => 'b' });

    await expect(settle(queryClient, listKey, other)).resolves.toBeUndefined();
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(true);
  });
});
