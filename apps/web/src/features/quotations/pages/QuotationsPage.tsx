import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleCheckBig,
  Download,
  Eye,
  FileText,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatRs,
  QUOTATION_STATUS_LABELS,
  type QuotationSortField,
  type QuotationStatus,
  type QuotationSummary,
  type SortDirection,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from '@/lib/toast';
import { saveBlob } from '@/lib/download';
import { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  fetchQuotationPdf,
  quotationPdfName,
  useDeleteQuotation,
  useQuotations,
  type QuotationListParams,
} from '../api/quotation-api';
import { QuotationPreview } from '../components/QuotationPreview';
import { SendQuotationModal } from '../components/SendQuotationModal';
import { OutcomeModal } from '../components/OutcomeModal';

const PAGE_SIZE = 25;

const STATUS_TONE: Record<QuotationStatus, 'neutral' | 'success' | 'warning' | 'brand'> = {
  DRAFT: 'neutral',
  SENT: 'brand',
  WON: 'success',
  LOST: 'warning',
};

const FILTERS: { value: QuotationStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

/**
 * A column header that sorts.
 *
 * The icon is always present, not only on the active column. A sort arrow that
 * appears on hover is invisible to anyone who has not already hovered, which
 * means the feature is only found by accident — the faint double arrow says
 * "this column sorts" before anyone touches it, and darkens into a single
 * arrow pointing the way it is currently ordered.
 *
 * `aria-sort` on the cell is what a screen reader announces; the arrow alone
 * would say nothing. The button carries the full sentence, so the title on
 * hover and the accessible name agree.
 */
function SortableHeader({
  field,
  sort,
  onSort,
  children,
}: {
  field: QuotationSortField;
  sort: { field: QuotationSortField; dir: SortDirection } | null;
  onSort: (field: QuotationSortField) => void;
  children: React.ReactNode;
}) {
  const active = sort?.field === field;
  const dir = active ? sort.dir : null;
  const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;

  const next = active
    ? dir === (field === 'customerName' || field === 'status' ? 'asc' : 'desc')
      ? 'reverse the order'
      : 'go back to the default order'
    : 'sort by this column';

  return (
    <th
      className="px-4 py-3 font-semibold"
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        title={`Click to ${next}`}
        className={cn(
          'focus-visible:ring-brand-500 -mx-1 flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 transition focus-visible:ring-2 focus-visible:outline-none',
          active ? 'text-ink-900' : 'hover:text-ink-700',
        )}
      >
        {children}
        <Icon
          className={cn('size-3.5 shrink-0', active ? 'text-brand-600' : 'text-ink-300')}
          aria-hidden
        />
      </button>
    </th>
  );
}

export default function QuotationsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QuotationStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  /**
   * Null is the default work-queue order, not "unsorted".
   *
   * Kept as one piece of state rather than a column and a direction, so there
   * is no state where a direction is set for no column — and so returning to
   * the default is a single assignment rather than clearing two things.
   */
  const [sort, setSort] = useState<{ field: QuotationSortField; dir: SortDirection } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<QuotationSummary | null>(null);
  const [sending, setSending] = useState<QuotationSummary | null>(null);
  const [deciding, setDeciding] = useState<QuotationSummary | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const deleteQuotation = useDeleteQuotation();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, sort]);

  const params = useMemo<QuotationListParams>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(status !== 'ALL' ? { status } : {}),
      ...(sort ? { sort: sort.field, dir: sort.dir } : {}),
    }),
    [page, debouncedSearch, status, sort],
  );

  const { data, isPending, isFetching, isError, error, refetch } = useQuotations(params);
  const quotations = data?.items ?? [];
  const pagination = data?.pagination;

  /**
   * Click a column: sort by it, click again to reverse, a third time to go back
   * to the work queue.
   *
   * The third click matters. Without it the default order — the queue of what
   * still needs doing — is unreachable once anything has been sorted, short of
   * reloading the page, and that order is the one the list is actually for.
   *
   * Text starts ascending and everything else descending, because that is what
   * each is wanted for: names are looked up alphabetically, while numbers and
   * dates are asked about newest-first.
   */
  function toggleSort(field: QuotationSortField) {
    setSort((current) => {
      if (current?.field !== field) {
        return { field, dir: field === 'customerName' || field === 'status' ? 'asc' : 'desc' };
      }
      const first = field === 'customerName' || field === 'status' ? 'asc' : 'desc';
      return current.dir === first ? { field, dir: first === 'asc' ? 'desc' : 'asc' } : null;
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteQuotation.mutateAsync(deleting.id);
      toast.success(`Quotation #${deleting.number} deleted`);
      setDeleting(null);
    } catch {
      toast.error('Could not delete the quotation');
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Quotations</h1>
          <p className="text-ink-500 mt-1 text-sm">
            {pagination ? (
              `${pagination.total} quotation${pagination.total === 1 ? '' : 's'}`
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Spinner size="sm" />
                Loading…
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => navigate('/quotations/new')}>
          <Plus className="size-4" />
          New quotation
        </Button>
      </header>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          {/*
            The search icon doubles as the activity light. The right-hand slot
            already holds the clear button, and swapping this decorative icon
            costs no layout shift and takes no affordance away — while a
            debounced search is in flight, the box itself says so.
          */}
          <span className="text-ink-400 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
            {isFetching && !isPending ? <Spinner size="sm" /> : <Search className="size-4" />}
          </span>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by quotation number, customer or job…"
            aria-label="Search quotations"
            className="pr-9 pl-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="text-ink-400 hover:text-ink-700 absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-full p-1"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="border-ink-200 flex flex-wrap rounded-[var(--radius-md)] border bg-white p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={cn(
                'cursor-pointer rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm font-medium',
                status === option.value
                  ? 'bg-brand-600 text-white'
                  : 'text-ink-600 hover:text-ink-900',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <section
        className={cn(
          'border-ink-200 mt-4 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]',
          isFetching && 'opacity-60',
        )}
      >
        {isError ? (
          <EmptyState
            title="Could not load quotations"
            description={error instanceof Error ? error.message : 'Something went wrong.'}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : isPending ? (
          <LoadingState label="Loading quotations…" />
        ) : quotations.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-8" />}
            title={search ? 'No quotations match your search' : 'No quotations yet'}
            action={
              search ? (
                <Button variant="secondary" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <Button onClick={() => navigate('/quotations/new')}>
                  <Plus className="size-4" />
                  New quotation
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                    <SortableHeader field="number" sort={sort} onSort={toggleSort}>
                      No.
                    </SortableHeader>
                    <SortableHeader field="customerName" sort={sort} onSort={toggleSort}>
                      Customer
                    </SortableHeader>
                    <SortableHeader field="date" sort={sort} onSort={toggleSort}>
                      Date
                    </SortableHeader>
                    <th className="px-4 py-3 text-right font-semibold">Jobs</th>
                    <th className="px-4 py-3 text-right font-semibold">Grand total</th>
                    <th className="px-4 py-3 text-right font-semibold">Advance</th>
                    <SortableHeader field="status" sort={sort} onSort={toggleSort}>
                      Status
                    </SortableHeader>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((quotation) => (
                    <tr
                      key={quotation.id}
                      className="border-ink-100 hover:bg-ink-25 cursor-pointer border-b"
                      onClick={() => setPreviewId(quotation.id)}
                    >
                      <td className="text-ink-900 px-4 py-3 font-semibold tabular-nums">
                        #{quotation.number}
                      </td>
                      <td className="text-ink-800 px-4 py-3">{quotation.customerName}</td>
                      <td className="text-ink-600 px-4 py-3 tabular-nums">
                        {formatDate(quotation.date)}
                      </td>
                      <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                        {quotation.itemCount}
                      </td>
                      <td className="text-ink-900 px-4 py-3 text-right font-medium tabular-nums">
                        {formatRs(quotation.grandWithGst)}
                      </td>
                      <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                        {formatRs(quotation.totalAdvance)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[quotation.status]}>
                          {QUOTATION_STATUS_LABELS[quotation.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <RowActions
                          quotation={quotation}
                          onPreview={() => setPreviewId(quotation.id)}
                          onSend={() => setSending(quotation)}
                          onOutcome={() => setDeciding(quotation)}
                          onDelete={() => setDeleting(quotation)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-ink-100 divide-y md:hidden">
              {quotations.map((quotation) => (
                <li
                  key={quotation.id}
                  className="flex items-start justify-between gap-3 px-4 py-3.5"
                >
                  <button
                    type="button"
                    onClick={() => setPreviewId(quotation.id)}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <p className="text-ink-900 text-sm font-medium">
                      #{quotation.number} · {quotation.customerName}
                    </p>
                    <p className="text-ink-500 mt-1 text-xs tabular-nums">
                      {formatDate(quotation.date)} · {formatRs(quotation.grandWithGst)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge tone={STATUS_TONE[quotation.status]}>
                        {QUOTATION_STATUS_LABELS[quotation.status]}
                      </Badge>
                      <Badge>
                        {quotation.itemCount} job{quotation.itemCount === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  </button>
                  <RowActions
                    quotation={quotation}
                    onPreview={() => setPreviewId(quotation.id)}
                    onSend={() => setSending(quotation)}
                    onOutcome={() => setDeciding(quotation)}
                    onDelete={() => setDeleting(quotation)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {pagination && pagination.totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
          <p className="text-ink-500 text-sm">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!pagination.hasPreviousPage}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}

      <QuotationPreview
        id={previewId}
        onClose={() => setPreviewId(null)}
        onSend={() => {
          // The previewed quotation is always one of the rows on screen.
          const quotation = quotations.find((row) => row.id === previewId);
          setPreviewId(null);
          if (quotation) setSending(quotation);
        }}
      />
      <SendQuotationModal quotation={sending} onClose={() => setSending(null)} />
      <OutcomeModal quotation={deciding} onClose={() => setDeciding(null)} />

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete quotation"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteQuotation.isPending} onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-ink-700 text-sm">
          Delete quotation <span className="font-semibold">#{deleting?.number}</span> for{' '}
          {deleting?.customerName}? This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

function RowActions({
  quotation,
  onPreview,
  onSend,
  onOutcome,
  onDelete,
}: {
  quotation: QuotationSummary;
  onPreview: () => void;
  onSend: () => void;
  onOutcome: () => void;
  onDelete: () => void;
}) {
  /*
   * The download lives here rather than in the page because this component is
   * rendered twice per quotation — once for the desktop table and once for the
   * mobile card — and each needs its own in-flight state.
   */
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await fetchQuotationPdf(quotation.id);
      saveBlob(blob, quotationPdfName(filename, quotation.number));
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : 'Could not prepare the document.',
      );
    } finally {
      setDownloading(false);
    }
  }

  const iconClass =
    'text-ink-500 hover:bg-brand-50 hover:text-brand-700 cursor-pointer rounded-[var(--radius-md)] p-2 inline-flex';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPreview}
        title="Preview"
        aria-label="Preview"
        className={iconClass}
      >
        <Eye className="size-4" />
      </button>
      {/*
        Only offered once a quotation has actually gone out. There is no answer
        to record on a draft nobody has seen, and winning it would create a
        customer and jobs off the back of an unsent document.
      */}
      {quotation.status !== 'DRAFT' ? (
        <button
          type="button"
          onClick={onOutcome}
          title="Record the answer"
          aria-label={`Record the answer for quotation ${quotation.number}`}
          className={iconClass}
        >
          <CircleCheckBig className="size-4" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onSend}
        title="Send by email"
        aria-label="Send by email"
        className={iconClass}
      >
        <Send className="size-4" />
      </button>
      {/*
        A button, not a link. The endpoint needs a session and the token
        travels in a header, which a browser navigation cannot carry — so the
        file is fetched and saved by script. Rendering takes fifteen seconds or
        more, hence the spinner: a download icon that does nothing visible for
        that long reads as a broken button.
      */}
      <button
        type="button"
        onClick={() => void onDownload()}
        disabled={downloading}
        title="Download PDF"
        aria-label="Download PDF"
        className={cn(iconClass, downloading && 'cursor-wait opacity-60')}
      >
        {downloading ? <Spinner size="sm" /> : <Download className="size-4" />}
      </button>
      <Link
        to={`/quotations/${quotation.id}/edit`}
        title="Edit"
        aria-label="Edit"
        className={iconClass}
      >
        <Pencil className="size-4" />
      </Link>
      <IconButton tone="danger" onClick={onDelete} title="Delete" aria-label="Delete">
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  );
}
