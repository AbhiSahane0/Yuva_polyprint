import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ProductionOrder } from '@yuva/shared';
import { productionKeys, useUpdateStage } from './production-api';
import { request } from '@/lib/api-client';

/**
 * **A field on a production run must show what was picked, not what the server has
 * got round to confirming.**
 *
 * The bug this pins: the machine and operator selects were bound to server
 * state, and every change waited for the PATCH *and* the three refetches
 * behind it before the cache moved. Until then the control re-rendered with
 * the old value — so on a works network, picking "Slitter" put "— pick one —"
 * back for several seconds and then snapped to Slitter. It read as a screen
 * refusing what it had been told.
 *
 * Four properties, each of which failed before:
 *   1. the value is in the cache before the request answers
 *   2. a failure puts the old value back
 *   3. two quick edits do not undo each other, in either arrival order
 *   4. a flow step still waits, because the server can refuse it
 */

vi.mock('@/lib/api-client', () => ({
  request: vi.fn(),
  ApiClientError: class extends Error {},
}));

const CARD_ID = 'card-1';
const STAGE_ID = 'stage-1';

function card(over: Partial<ProductionOrder> = {}): ProductionOrder {
  return {
    id: CARD_ID,
    number: 4,
    status: 'RUNNING',
    orderId: 'order-1',
    orderNumber: 7,
    customerName: 'Samant Foods',
    jobName: 'Chitra Wafers 10Rs.',
    jobId: 'job-1',
    quantityKg: 600,
    notes: '',
    dueDate: null,
    startedAt: null,
    completedAt: null,
    progressPercent: 0,
    currentStage: 'SLITTING',
    plies: [],
    materials: [],
    materialOverrideReason: '',
    stages: [
      {
        id: STAGE_ID,
        position: 3,
        stage: 'SLITTING',
        pass: 0,
        status: 'RUNNING',
        machineId: null,
        machineName: '',
        operatorId: null,
        operator: '',
        inputKg: 190,
        outputKg: 0,
        wasteKg: 190,
        startedAt: null,
        finishedAt: null,
        notes: '',
      },
    ],
    ...over,
  } as ProductionOrder;
}

/** The cached stage, as the select would read it. */
function stageIn(client: QueryClient) {
  return client.getQueryData<ProductionOrder>(productionKeys.detail(CARD_ID))?.stages[0];
}

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(productionKeys.detail(CARD_ID), card());
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateStage(), { wrapper });
  return { client, result };
}

/** A request that only answers when the test says so. */
function deferred<T>() {
  let settle!: (value: T) => void;
  let fail!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

describe('a production run field shows at once', () => {
  it('puts the picked machine in the cache before the server answers', async () => {
    const { client, result } = harness();
    const pending = deferred<ProductionOrder>();
    vi.mocked(request).mockReturnValueOnce(pending.promise as never);

    act(() => {
      void result.current.mutateAsync({
        cardId: CARD_ID,
        stageId: STAGE_ID,
        input: { machineId: 'machine-9' },
        optimistic: { machineId: 'machine-9', machineName: 'Slitter' },
      });
    });

    /* Nothing has answered yet — this is the whole point. */
    await waitFor(() => expect(stageIn(client)?.machineId).toBe('machine-9'));
    expect(stageIn(client)?.machineName).toBe('Slitter');

    await act(async () => {
      pending.settle(
        card({
          stages: [{ ...card().stages[0]!, machineId: 'machine-9', machineName: 'Slitter' }],
        }),
      );
      await pending.promise;
    });
  });

  it('works out the waste as the weights are typed', async () => {
    const { client, result } = harness();
    const pending = deferred<ProductionOrder>();
    vi.mocked(request).mockReturnValueOnce(pending.promise as never);

    act(() => {
      void result.current.mutateAsync({
        cardId: CARD_ID,
        stageId: STAGE_ID,
        input: { outputKg: 185 },
        optimistic: { outputKg: 185 },
      });
    });

    /* 190 in, 185 out — the figure beside the boxes moves with them. */
    await waitFor(() => expect(stageIn(client)?.wasteKg).toBe(5));

    await act(async () => {
      pending.settle(card());
      await pending.promise;
    });
  });

  it('puts the old value back when the save fails', async () => {
    const { client, result } = harness();
    vi.mocked(request).mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      await result.current
        .mutateAsync({
          cardId: CARD_ID,
          stageId: STAGE_ID,
          input: { machineId: 'machine-9' },
          optimistic: { machineId: 'machine-9', machineName: 'Slitter' },
        })
        .catch(() => undefined);
    });

    expect(stageIn(client)?.machineId).toBeNull();
    expect(stageIn(client)?.machineName).toBe('');
  });

  it('does not let an older reply undo a newer edit', async () => {
    const { client, result } = harness();
    const first = deferred<ProductionOrder>();
    const second = deferred<ProductionOrder>();
    vi.mocked(request)
      .mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never);

    const machine = (id: string | null, name: string) =>
      card({ stages: [{ ...card().stages[0]!, machineId: id, machineName: name }] });

    act(() => {
      void result.current.mutateAsync({
        cardId: CARD_ID,
        stageId: STAGE_ID,
        input: { machineId: 'machine-1' },
        optimistic: { machineId: 'machine-1', machineName: 'Slitter' },
      });
    });
    act(() => {
      void result.current.mutateAsync({
        cardId: CARD_ID,
        stageId: STAGE_ID,
        input: { operatorId: 'person-2' },
        optimistic: { operatorId: 'person-2', operator: 'Manoj Jadhav' },
      });
    });

    /* Both are on screen already. */
    await waitFor(() => expect(stageIn(client)?.operatorId).toBe('person-2'));
    expect(stageIn(client)?.machineId).toBe('machine-1');

    /* Now the SECOND answers first, and the first answers last carrying a card
       that never heard of the operator. It must not be written over the top. */
    await act(async () => {
      second.settle(machine('machine-1', 'Slitter'));
      await second.promise;
    });
    await act(async () => {
      first.settle(machine('machine-1', 'Slitter'));
      await first.promise;
    });

    expect(stageIn(client)?.operatorId).toBe('person-2');
    expect(stageIn(client)?.machineId).toBe('machine-1');
  });

  it('leaves a flow step to the server, with nothing guessed at', async () => {
    const { client, result } = harness();
    const pending = deferred<ProductionOrder>();
    vi.mocked(request).mockReturnValueOnce(pending.promise as never);

    act(() => {
      void result.current.mutateAsync({
        cardId: CARD_ID,
        stageId: STAGE_ID,
        input: { status: 'DONE' },
        /* No `optimistic` — finishing hands the reel to the next machine and
           can be refused, and neither can be worked out here. */
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stageIn(client)?.status).toBe('RUNNING');

    await act(async () => {
      pending.settle(card({ stages: [{ ...card().stages[0]!, status: 'DONE' }] }));
      await pending.promise;
    });
    await waitFor(() => expect(stageIn(client)?.status).toBe('DONE'));
  });
});
