import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Search, Trash2 } from 'lucide-react';
import {
  formatNumber,
  formatRs,
  JOB_SHEET_STATUS_LABELS,
  type JobSheetSummary,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useDebounce } from '@/hooks/useDebounce';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useCreateJobSheet, useDeleteJobSheet, useJobSheets } from '../api/job-sheet-api';

const TONE: Record<JobSheetSummary['status'], 'neutral' | 'brand' | 'success'> = {
  OPEN: 'neutral',
  COSTED: 'brand',
  CLOSED: 'success',
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/**
 * **Job sheets: what a run actually cost.**
 *
 * The list is ordered newest first and leads with the cost a kilogram, because
 * that is the one figure anybody comes here for — it is what the office prices
 * repeat work from, and the reason the sheet is filled in at all.
 */
export default function JobSheetsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [deleting, setDeleting] = useState<JobSheetSummary | null>(null);

  const debounced = useDebounce(search, 300);
  const params = useMemo(
    () => ({
      ...(debounced ? { search: debounced } : {}),
      ...(status ? { status: status as 'OPEN' } : {}),
    }),
    [debounced, status],
  );

  const { data, isLoading } = useJobSheets(params);
  const create = useCreateJobSheet();
  const remove = useDeleteJobSheet();

  const sheets = data?.items ?? [];

  async function startSheet() {
    try {
      const sheet = await create.mutateAsync({ date: new Date().toISOString().slice(0, 10) });
      navigate(`/job-sheets/${sheet.id}`);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not start a new job sheet',
      );
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(`Job sheet ${deleting.number} deleted`);
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not delete that sheet');
    }
  }

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink-900 text-xl font-semibold">Job sheets</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            What a run actually consumed, and what it cost a kilogram.
          </p>
        </div>
        <Button onClick={startSheet} disabled={create.isPending}>
          <Plus className="size-4" />
          New job sheet
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Job, customer or sheet number"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-44"
          aria-label="Status"
        >
          <option value="">Every status</option>
          {(['OPEN', 'COSTED', 'CLOSED'] as const).map((value) => (
            <option key={value} value={value}>
              {JOB_SHEET_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : sheets.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title="No job sheets yet"
          description="Start one when a job goes on the floor, and fill it in as the material is issued and returned."
        />
      ) : (
        <div className="border-ink-200 overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-ink-200 text-ink-500 border-b text-left text-xs tracking-wide uppercase">
                <th className="px-3 py-2.5 font-semibold">Sheet</th>
                <th className="px-3 py-2.5 font-semibold">Job</th>
                <th className="px-3 py-2.5 font-semibold">Form</th>
                <th className="px-3 py-2.5 text-right font-semibold">Output</th>
                <th className="px-3 py-2.5 text-right font-semibold">Material</th>
                <th className="px-3 py-2.5 text-right font-semibold">Cost a kg</th>
                <th className="px-3 py-2.5 text-right font-semibold">Wastage</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sheets.map((sheet) => (
                <tr
                  key={sheet.id}
                  onClick={() => navigate(`/job-sheets/${sheet.id}`)}
                  className="border-ink-100 hover:bg-ink-50 cursor-pointer border-b last:border-b-0"
                >
                  <td className="px-3 py-2.5">
                    <div className="text-ink-900 font-semibold tabular-nums">{sheet.number}</div>
                    <div className="text-ink-500 text-xs tabular-nums">
                      {formatDate(sheet.date)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-ink-900">{sheet.jobName || '—'}</div>
                    <div className="text-ink-500 text-xs">{sheet.customerName}</div>
                  </td>
                  <td className="text-ink-600 px-3 py-2.5">
                    {sheet.isPouchForm ? 'Pouch' : 'Roll'}
                  </td>
                  <td className="text-ink-700 px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(sheet.finalOutputKg, 2)} kg
                  </td>
                  <td className="text-ink-700 px-3 py-2.5 text-right tabular-nums">
                    {formatRs(sheet.materialCost)}
                  </td>
                  {/* The figure the whole sheet exists to produce. */}
                  <td className="text-ink-900 px-3 py-2.5 text-right font-semibold tabular-nums">
                    {formatRs(sheet.costPerKg, 2)}
                  </td>
                  <td
                    className={
                      sheet.wastagePercent > 5
                        ? 'text-danger-700 px-3 py-2.5 text-right font-semibold tabular-nums'
                        : 'text-ink-600 px-3 py-2.5 text-right tabular-nums'
                    }
                  >
                    {formatNumber(sheet.wastagePercent, 2)}%
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={TONE[sheet.status]}>{JOB_SHEET_STATUS_LABELS[sheet.status]}</Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    {/* A posted sheet is refused by the server; no button for it. */}
                    {sheet.stockPostedAt ? null : (
                      <button
                        type="button"
                        aria-label={`Delete job sheet ${sheet.number}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleting(sheet);
                        }}
                        className="text-ink-400 hover:text-danger-600 p-1"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete job sheet ${deleting?.number ?? ''}?`}
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      >
        The sheet and everything recorded on it will be removed. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
