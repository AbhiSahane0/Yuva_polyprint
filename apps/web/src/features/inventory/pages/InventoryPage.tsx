import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, Search, X } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  HEALTH_LABELS,
  MATERIAL_CATEGORY_LABELS,
  type MaterialCategory,
  type StockHealth,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { useStock } from '../api/inventory-api';
import { ReceiveStockModal } from '../components/ReceiveStockModal';

/**
 * How stock health reads. Amber for low, red-ish for out — the two are
 * different problems: one is "order some", the other is "we cannot run".
 */
const HEALTH_TONE: Record<StockHealth, 'neutral' | 'success' | 'warning' | 'brand'> = {
  HEALTHY: 'success',
  LOW: 'warning',
  OUT: 'warning',
  UNSET: 'neutral',
};

const CATEGORIES: (MaterialCategory | 'ALL')[] = [
  'ALL',
  'FILM',
  'INK',
  'ADHESIVE',
  'SOLVENT',
  'CONSUMABLE',
];

/** Quantities are read in columns, so they line up and carry their unit. */
function Quantity({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="tabular-nums">
      {formatNumber(value, value % 1 === 0 ? 0 : 2)}
      <span className="text-ink-400 ml-1 text-xs font-normal">{unit}</span>
    </span>
  );
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<MaterialCategory | 'ALL'>('ALL');
  const [lowOnly, setLowOnly] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(category !== 'ALL' ? { category } : {}),
      ...(lowOnly ? { lowOnly: true } : {}),
    }),
    [debouncedSearch, category, lowOnly],
  );

  const { data, isPending, isError, error, refetch } = useStock(params);
  const items = data?.items ?? [];
  const totals = data?.totals;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Inventory</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            What the works holds, what it is worth, and what is running out.
          </p>
        </div>
        <Button onClick={() => setReceiving(true)}>
          <PackagePlus className="size-4" />
          Receive material
        </Button>
      </header>

      {/*
       * Four figures, and the two in the middle are the reason anybody opens
       * this screen twice. "No level set" is its own count rather than being
       * folded into healthy: a material nobody has set a level for is not known
       * to be fine, it is simply not being watched.
       */}
      {totals ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="Materials in stock" value={formatNumber(totals.materialsInStock)} />
          <Summary
            label="Need reordering"
            value={formatNumber(totals.lowStock)}
            tone={totals.lowStock > 0 ? 'warning' : undefined}
            onClick={totals.lowStock > 0 ? () => setLowOnly(true) : undefined}
          />
          <Summary label="No level set" value={formatNumber(totals.withoutLevel)} />
          <Summary label="Stock value" value={formatRs(totals.totalValue)} />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={category === option}
              onClick={() => setCategory(option)}
              className={cn(
                'focus-visible:ring-brand-500 cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none',
                category === option
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-50 bg-white',
              )}
            >
              {option === 'ALL' ? 'All' : MATERIAL_CATEGORY_LABELS[option]}
            </button>
          ))}
          {lowOnly ? (
            <button
              type="button"
              onClick={() => setLowOnly(false)}
              className="border-warning-200 bg-warning-50 text-warning-700 hover:bg-warning-100 inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium"
            >
              Needs reordering
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="relative sm:ml-auto sm:w-64">
          <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search materials…"
            className="pl-9"
            aria-label="Search materials"
          />
        </div>
      </div>

      {isError ? (
        <section className="border-ink-200 mt-6 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="Could not load stock"
            description={error instanceof Error ? error.message : 'Something went wrong.'}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </section>
      ) : isPending ? (
        <LoadingState label="Loading stock…" className="mt-8" />
      ) : items.length === 0 ? (
        <section className="border-ink-200 mt-6 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title={lowOnly ? 'Nothing needs reordering' : 'No materials match'}
            description={
              lowOnly
                ? 'Every material with a reorder level is above it.'
                : 'Try a different category, or clear the search.'
            }
          />
        </section>
      ) : (
        <section className="border-ink-200 mt-4 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Material</th>
                  <th className="px-4 py-3 text-right font-semibold">On hand</th>
                  <th className="px-4 py-3 text-right font-semibold">Reorder at</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Where</th>
                  <th className="px-4 py-3 text-right font-semibold">Rate</th>
                  <th className="px-4 py-3 text-right font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.materialId}
                    className="border-ink-100 hover:bg-ink-25 cursor-pointer border-b"
                    onClick={() => navigate(`/inventory/${item.materialId}`)}
                  >
                    <td className="text-ink-900 px-4 py-3 font-medium">
                      {item.name}
                      <span className="text-ink-400 ml-2 text-xs font-normal">
                        {item.batchCount > 0
                          ? `${item.batchCount} batch${item.batchCount === 1 ? '' : 'es'}`
                          : 'no stock'}
                      </span>
                    </td>
                    <td className="text-ink-900 px-4 py-3 text-right font-medium">
                      <Quantity value={item.quantity} unit={item.unit} />
                    </td>
                    <td className="text-ink-500 px-4 py-3 text-right tabular-nums">
                      {item.reorderLevel === null ? (
                        <span className="text-ink-300">—</span>
                      ) : (
                        formatNumber(item.reorderLevel, 0)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={HEALTH_TONE[item.health]}>{HEALTH_LABELS[item.health]}</Badge>
                    </td>
                    <td className="text-ink-500 px-4 py-3 text-xs">
                      {item.locations.length > 0 ? item.locations.join(', ') : '—'}
                    </td>
                    <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                      {item.currentRate === null ? (
                        <span className="text-ink-300">—</span>
                      ) : (
                        `${formatRs(item.currentRate, 2)}/${item.unit}`
                      )}
                    </td>
                    <td className="text-ink-900 px-4 py-3 text-right font-medium tabular-nums">
                      {item.value > 0 ? (
                        formatRs(item.value)
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: the same rows, as cards. */}
          <ul className="divide-ink-100 divide-y md:hidden">
            {items.map((item) => (
              <li key={item.materialId}>
                <button
                  type="button"
                  onClick={() => navigate(`/inventory/${item.materialId}`)}
                  className="w-full cursor-pointer px-4 py-3.5 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-ink-900 text-sm font-medium">{item.name}</p>
                    <Badge tone={HEALTH_TONE[item.health]}>{HEALTH_LABELS[item.health]}</Badge>
                  </div>
                  <p className="text-ink-500 mt-1 text-xs">
                    <Quantity value={item.quantity} unit={item.unit} />
                    {item.value > 0 ? ` · ${formatRs(item.value)}` : ''}
                    {item.locations.length > 0 ? ` · ${item.locations.join(', ')}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReceiveStockModal open={receiving} onClose={() => setReceiving(false)} />
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone?: 'warning';
  onClick?: (() => void) | undefined;
}) {
  const content = (
    <>
      <div
        className={cn(
          'text-lg font-bold tabular-nums',
          tone === 'warning' ? 'text-warning-600' : 'text-ink-900',
        )}
      >
        {value}
      </div>
      <div className="text-ink-500 mt-0.5 text-xs">{label}</div>
    </>
  );

  const className =
    'border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 text-left shadow-[var(--shadow-card)]';

  // Only the count that can be acted on is a button — a figure that looks
  // clickable and does nothing is worse than one that plainly does not.
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(className, 'hover:bg-ink-25 cursor-pointer')}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
