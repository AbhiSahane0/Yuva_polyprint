import { useEffect, useMemo, useState } from 'react';
import {
  History,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  formatNumber,
  MATERIAL_CATEGORY_LABELS,
  type Material,
  type MaterialCategory,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/lib/api-client';
import { useDeleteMaterial, useMaterials, useRateHistory, useSaveRates } from '../api/rate-api';
import { MaterialModal } from '../components/MaterialModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const CATEGORY_ORDER: MaterialCategory[] = ['FILM', 'INK', 'ADHESIVE', 'SOLVENT', 'CONSUMABLE'];

/**
 * What the costing multiplies this material's price by, for the button's title.
 *
 * A missing density is worth saying out loud: without it a film's pouches are
 * counted off a flat 1.1 stand-in instead of what the film actually weighs.
 */
function specHint(material: Material): string {
  const parts: string[] = [];
  if (material.category === 'FILM') {
    parts.push(
      material.density != null
        ? `density ${material.density}`
        : 'no density — weighed by a stand-in',
    );
  }
  if (material.solidsPercent != null) parts.push(`${material.solidsPercent}% solids`);
  if (material.laydownGsm != null) parts.push(`${material.laydownGsm} g/m²`);
  return parts.length > 0 ? `Figures — ${parts.join(', ')}` : 'Figures the costing uses';
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

export default function RatesPage() {
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<Material | null>(null);
  /* Null with the modal open adds a new material; a material edits that one. */
  const [editing, setEditing] = useState<Material | null>(null);
  const [adding, setAdding] = useState(false);
  /*
   * Deleting is for a mistake — a name typed wrong, a film added and thought
   * better of. The server refuses the moment it is on a quotation, a stock
   * batch or a purchase line, and says which; taking it off the price list is
   * what that case wants, and that is on the figures dialog beside it.
   */
  const [deleting, setDeleting] = useState<Material | null>(null);
  const deleteMaterial = useDeleteMaterial();

  const { data: materials, isPending, isError, error, refetch } = useMaterials(effectiveDate);
  const saveRates = useSaveRates();

  // Changing the date shows a different day's rates, so anything half-typed for
  // the previous day would be saved against the wrong one.
  useEffect(() => {
    setDrafts({});
  }, [effectiveDate]);

  const grouped = useMemo(() => {
    const map = new Map<MaterialCategory, Material[]>();
    for (const material of materials ?? []) {
      const list = map.get(material.category) ?? [];
      list.push(material);
      map.set(material.category, list);
    }
    return CATEGORY_ORDER.filter((category) => map.has(category)).map((category) => ({
      category,
      materials: map.get(category) ?? [],
    }));
  }, [materials]);

  /** Only materials the user actually typed a new rate for. */
  const pending = useMemo(
    () =>
      Object.entries(drafts).filter(([materialId, value]) => {
        if (value.trim() === '') return false;
        const material = materials?.find((m) => m.id === materialId);
        // Retyping the same number is not a change worth recording.
        return !material || Number(value) !== material.currentRate;
      }),
    [drafts, materials],
  );

  async function onSave() {
    if (pending.length === 0) {
      toast.error('Nothing to save — enter at least one new rate');
      return;
    }
    try {
      const result = await saveRates.mutateAsync({
        effectiveDate,
        enteredBy: 'Office',
        entries: pending.map(([materialId, rate]) => ({ materialId, rate: Number(rate) })),
      });
      setDrafts({});
      toast.success(
        `${result.created + result.updated} rate${result.created + result.updated === 1 ? '' : 's'} saved for ${formatDate(result.effectiveDate)}`,
      );
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save the rates');
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Rates</h1>
          <p className="text-ink-500 mt-1 max-w-2xl text-sm">
            Today&rsquo;s raw material prices. Every quotation is costed against the rates in force
            on its own date, so a quotation already sent keeps the margin it was made on.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <Field label="Rates for" htmlFor="effectiveDate">
              <Input
                id="effectiveDate"
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </Field>
          </div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add a material
          </Button>
          <Button onClick={onSave} loading={saveRates.isPending} disabled={pending.length === 0}>
            <Save className="size-4" />
            Save{pending.length > 0 ? ` (${pending.length})` : ''}
          </Button>
        </div>
      </header>

      {isError ? (
        <section className="border-ink-200 mt-6 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="Could not load rates"
            description={error instanceof Error ? error.message : 'Something went wrong.'}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </section>
      ) : isPending ? (
        <LoadingState label="Loading rates…" className="mt-8" />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {grouped.map(({ category, materials: rows }) => (
            <section
              key={category}
              className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]"
            >
              <h2 className="border-ink-200 bg-ink-25 text-ink-700 border-b px-4 py-2.5 text-xs font-semibold tracking-wider uppercase">
                {MATERIAL_CATEGORY_LABELS[category]}
              </h2>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-ink-100 text-ink-500 border-b text-left">
                    <th className="px-4 py-2 font-medium">Material</th>
                    <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                      Previous
                    </th>
                    <th className="px-4 py-2 text-right font-medium">Current</th>
                    <th className="px-4 py-2 text-right font-medium">New rate</th>
                    <th className="px-4 py-2 text-right font-medium">Change</th>
                    <th className="px-2 py-2">
                      <span className="sr-only">Figures and history</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((material) => {
                    const draft = drafts[material.id] ?? '';
                    const typed = draft.trim() === '' ? null : Number(draft);
                    const base = material.currentRate;
                    // Preview the move the typed rate would make, before saving.
                    const delta =
                      typed !== null && base !== null && base > 0
                        ? ((typed - base) / base) * 100
                        : material.changePercent;
                    const isPreview = typed !== null && typed !== base;

                    return (
                      <tr key={material.id} className="border-ink-100 border-b last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="text-ink-900 font-medium">{material.name}</span>
                          <span className="text-ink-400 ml-2 text-xs">/{material.unit}</span>
                        </td>
                        <td className="text-ink-400 hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
                          {material.previousRate === null
                            ? '—'
                            : formatNumber(material.previousRate, 2)}
                        </td>
                        <td className="text-ink-700 px-4 py-2.5 text-right tabular-nums">
                          {base === null ? '—' : formatNumber(base, 2)}
                        </td>
                        <td className="px-4 py-2.5">
                          <NumberInput
                            aria-label={`New rate for ${material.name}`}
                            placeholder={base === null ? '0.00' : formatNumber(base, 2)}
                            value={draft}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [material.id]: event.target.value,
                              }))
                            }
                            className={cn(
                              'py-1.5 text-right tabular-nums',
                              isPreview && 'border-brand-600 bg-brand-50',
                            )}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {delta === null || Number.isNaN(delta) ? (
                            <span className="text-ink-300">—</span>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
                                delta > 0
                                  ? 'text-danger-600'
                                  : delta < 0
                                    ? 'text-success-600'
                                    : 'text-ink-400',
                              )}
                            >
                              {delta > 0 ? (
                                <TrendingUp className="size-3.5" />
                              ) : delta < 0 ? (
                                <TrendingDown className="size-3.5" />
                              ) : null}
                              {delta > 0 ? '+' : ''}
                              {formatNumber(delta, 2)}%
                            </span>
                          )}
                        </td>
                        <td className="flex justify-end gap-1 px-2 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setEditing(material)}
                            aria-label={`Figures for ${material.name}`}
                            title={specHint(material)}
                            className="text-ink-400 hover:bg-ink-100 hover:text-ink-700 cursor-pointer rounded-[var(--radius-md)] p-2"
                          >
                            <SlidersHorizontal className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryFor(material)}
                            aria-label={`Rate history for ${material.name}`}
                            title="Rate history"
                            className="text-ink-400 hover:bg-ink-100 hover:text-ink-700 cursor-pointer rounded-[var(--radius-md)] p-2"
                          >
                            <History className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(material)}
                            aria-label={`Delete ${material.name}`}
                            title="Delete — only a material nothing has used"
                            className="text-ink-400 hover:bg-danger-50 hover:text-danger-600 cursor-pointer rounded-[var(--radius-md)] p-2"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      <RateHistoryModal material={historyFor} onClose={() => setHistoryFor(null)} />
      <MaterialModal
        open={adding || editing !== null}
        material={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? ''}?`}
        confirmLabel="Delete"
        loading={deleteMaterial.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteMaterial.mutate(
            /* No `discardStock` here: this screen is the price list and does
               not show what is held. A material with stock is refused and told
               to be deleted from Inventory, where the figures are on screen. */
            { id: deleting.id },
            {
              onSuccess: () => {
                toast.success(`${deleting.name} deleted`);
                setDeleting(null);
              },
              onError: (cause) =>
                toast.error(
                  cause instanceof ApiClientError
                    ? cause.message
                    : 'Could not delete that material',
                ),
            },
          );
        }}
      >
        It goes for good, and its whole price history with it.
        <p className="mt-2">
          Refused if it is on a quotation or a purchase order, saying which — those have to stay
          able to say what they were priced on. Refused too while it holds stock: delete it from
          Inventory instead, where how much goes with it is on screen before you confirm.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function RateHistoryModal({
  material,
  onClose,
}: {
  material: Material | null;
  onClose: () => void;
}) {
  const { data, isPending } = useRateHistory(material?.id ?? null);

  return (
    <Modal
      open={material !== null}
      onClose={onClose}
      title={material ? `${material.name} — rate history` : 'Rate history'}
      description="Every recorded change, most recent first."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {isPending ? (
        <div className="text-ink-400 flex items-center gap-2 py-6 text-sm">
          <Spinner size="sm" />
          Loading history…
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-ink-500 py-6 text-sm">No rates recorded yet.</p>
      ) : (
        <ul className="divide-ink-100 divide-y text-sm">
          {data.map((entry, index) => {
            const next = data[index + 1];
            const delta =
              next && next.rate > 0 ? ((entry.rate - next.rate) / next.rate) * 100 : null;
            return (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-ink-600 tabular-nums">{formatDate(entry.effectiveDate)}</span>
                <span className="text-ink-900 font-medium tabular-nums">
                  {formatNumber(entry.rate, 2)}
                  <span className="text-ink-400 ml-1 text-xs">/{material?.unit}</span>
                </span>
                <span className="w-20 text-right">
                  {delta === null ? (
                    <Badge>opening</Badge>
                  ) : (
                    <span
                      className={cn(
                        'text-xs font-medium tabular-nums',
                        delta > 0
                          ? 'text-danger-600'
                          : delta < 0
                            ? 'text-success-600'
                            : 'text-ink-400',
                      )}
                    >
                      {delta > 0 ? '+' : ''}
                      {formatNumber(delta, 2)}%
                    </span>
                  )}
                </span>
                <span className="text-ink-400 w-16 text-right text-xs">{entry.enteredBy}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
