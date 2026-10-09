import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Search, Trash2 } from 'lucide-react';
import { formatNumber, type JobCardSummary } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useDebounce } from '@/hooks/useDebounce';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useCreateJobCard, useDeleteJobCard, useJobCards } from '../api/job-card-api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/**
 * **Job cards: the instruction, written before the run.**
 *
 * The other half of the works' pair of documents. A card says what a job is
 * and what it will take — film, sizes, weights, metres, hours — and is handed
 * to the floor and signed. What a run then CONSUMED is a job sheet, which is a
 * different screen written by different people at a different moment.
 *
 * Newest first, because the card anybody is looking for is almost always the
 * one raised this week.
 */
export default function JobCardsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<JobCardSummary | null>(null);

  const debounced = useDebounce(search, 300);
  const params = useMemo(() => (debounced ? { search: debounced } : {}), [debounced]);

  const { data, isLoading } = useJobCards(params);
  const create = useCreateJobCard();
  const remove = useDeleteJobCard();

  const cards = data?.items ?? [];

  async function startCard() {
    try {
      const card = await create.mutateAsync({ date: new Date().toISOString().slice(0, 10) });
      navigate(`/job-cards/${card.id}`);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not start a new job card',
      );
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(`Job card ${deleting.number} deleted`);
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not delete that card');
    }
  }

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink-900 text-xl font-semibold">Job cards</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            What the floor is to make and what it will take. Raised when the order is in hand,
            printed, and signed by whoever prepares, runs and approves it.
          </p>
        </div>
        <Button onClick={startCard} disabled={create.isPending}>
          <Plus className="size-4" />
          New job card
        </Button>
      </header>

      <div className="relative max-w-md">
        <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Job, customer, work order or card number"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title="No job cards yet"
          description="Raise one when an order is in hand. Everything on it but a handful of boxes is worked out from the design."
        />
      ) : (
        <div className="border-ink-200 overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-ink-200 text-ink-500 border-b text-left text-xs tracking-wide uppercase">
                <th className="px-3 py-2.5 font-semibold">Card</th>
                <th className="px-3 py-2.5 font-semibold">Job</th>
                <th className="px-3 py-2.5 font-semibold">Work order</th>
                <th className="px-3 py-2.5 text-right font-semibold">Quantity</th>
                <th className="px-3 py-2.5 font-semibold">Despatch</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr
                  key={card.id}
                  onClick={() => navigate(`/job-cards/${card.id}`)}
                  className="border-ink-100 hover:bg-ink-50 cursor-pointer border-b last:border-b-0"
                >
                  <td className="px-3 py-2.5">
                    <div className="text-ink-900 font-semibold tabular-nums">{card.number}</div>
                    <div className="text-ink-500 text-xs tabular-nums">{formatDate(card.date)}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-ink-900">{card.jobName || '—'}</div>
                    <div className="text-ink-500 text-xs">
                      {card.customerName}
                      {card.orderNumber !== null ? ` · order #${card.orderNumber}` : ''}
                    </div>
                  </td>
                  <td className="text-ink-600 px-3 py-2.5">{card.workOrderNo || '—'}</td>
                  <td className="text-ink-700 px-3 py-2.5 text-right tabular-nums">
                    {card.quantityKg > 0 ? `${formatNumber(card.quantityKg, 2)} kg` : '—'}
                  </td>
                  <td className="text-ink-600 px-3 py-2.5 tabular-nums">
                    {formatDate(card.dispatchDate)}
                  </td>
                  <td className="px-3 py-2.5">
                    <IconButton
                      tone="danger"
                      aria-label={`Delete job card ${card.number}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleting(card);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete job card ${deleting?.number ?? ''}?`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        The card and everything typed on it goes. Nothing else is affected — a job sheet costing
        this run stands on its own.
      </ConfirmDialog>
    </div>
  );
}
