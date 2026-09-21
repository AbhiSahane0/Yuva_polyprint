import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * **A mutation is not finished until the screen shows what it did.**
 *
 * The flash this exists to remove: save a rate, and for one network round trip
 * the old figure is still on screen. `invalidateQueries` marks the cache stale
 * and starts a refetch, but it does not wait for it — so the mutation settles,
 * the modal closes, the toast says "saved", and the list goes on showing the
 * previous value until the refetch lands and snaps it to the new one.
 *
 * On the Rates screen it is worse than a flash, because saving also clears the
 * drafts: the box you typed 200 into falls back to the cached 185, sits there,
 * and then becomes 200. Nothing is wrong with the data at any point, which is
 * exactly why it reads as a bug — the screen is telling you two different
 * things about the same moment.
 *
 * React Query awaits a promise returned from `onSuccess` before considering a
 * mutation settled. So returning this keeps the button in its loading state
 * until the queries behind the screen have actually refetched, and everything
 * that runs after the save — closing a dialog, clearing a draft, a toast — runs
 * against fresh data. The cost is that the spinner runs for one round trip
 * longer, which is the honest length of the operation.
 *
 * **Why this rather than an optimistic update.** Writing the expected value
 * into the cache before the server answers is faster still, and it shows a
 * figure nobody has confirmed: the server rounds, recomputes, applies a dated
 * setting and can refuse outright. On a screen whose whole job is to say what
 * something costs, a number that appears and is then quietly corrected is worse
 * than a number that takes an extra moment to appear.
 */
export function settle(client: QueryClient, ...keys: QueryKey[]): Promise<void> {
  return Promise.all(
    keys.map((queryKey) =>
      client.invalidateQueries({ queryKey }).catch(() => {
        /*
         * A refetch that fails must not turn a save that worked into an error.
         *
         * The write happened; this is only the reading back of it. Swallowing
         * it leaves the stale figure on screen with no toast to explain it,
         * which is bad — and still better than telling somebody their rate did
         * not save when it did, and having them type it again.
         */
      }),
    ),
  ).then(() => undefined);
}
