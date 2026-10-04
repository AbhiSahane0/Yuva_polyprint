import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Disc3, Image, Search, UserPlus } from 'lucide-react';
import type { DesignMasterRow } from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Combobox } from '@/components/ui/Combobox';
import { Field, Input, Select } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { useCustomers } from '@/features/customers/api/customer-api';
import { useDebounce } from '@/hooks/useDebounce';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useAssignDesignCustomer, useDesigns } from '../api/job-api';

function Stat({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border bg-white px-4 py-3',
        alarm && value > 0 ? 'border-warning-200' : 'border-ink-200',
      )}
    >
      <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-xl font-bold tabular-nums',
          alarm && value > 0 ? 'text-warning-700' : 'text-ink-900',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * **Designs — every product the works has on its books.**
 *
 * The list nothing else provided. A design belongs to a customer and is
 * edited on that customer's page, which works for all of them but the ones
 * that came off the old sheets with **nobody's name on them**: those belong
 * to no customer, so no customer's page lists them, and there was no way to
 * find them at all.
 *
 * So they sort first, and "Needs a customer" is one click. Putting a customer
 * to one is the only thing this screen changes — after that the design is
 * theirs and is edited where every other design is edited. A second editor
 * here would be a second place for the same fields to drift.
 */
export default function DesignsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'customers');

  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'needsCustomer' | 'quoted'>('all');
  const [page, setPage] = useState(1);
  const [assigning, setAssigning] = useState<DesignMasterRow | null>(null);

  const debounced = useDebounce(search, 300);
  const params = useMemo(
    () => ({
      page,
      pageSize: 25,
      ...(debounced ? { q: debounced } : {}),
      ...(view === 'needsCustomer' ? { needsCustomer: true } : {}),
      ...(view === 'quoted' ? { quotedOnly: true } : {}),
    }),
    [debounced, view, page],
  );

  const { data, isLoading } = useDesigns(params);
  const rows = data?.items ?? [];
  const totals = data?.totals;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6">
        <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Designs</h1>
        <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
          Every product the works has on its books — what it is made of, who it belongs to and what
          has been done with it. A design is edited on its customer's page; the ones with no
          customer are put right here.
        </p>
      </header>

      {totals ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Designs" value={totals.designs} />
          <Stat label="Need a customer" value={totals.needCustomer} alarm />
          <Stat label="Ever quoted" value={totals.everQuoted} />
          <Stat label="With cylinders" value={totals.withCylinders} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Design name, code or customer…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Search designs"
          />
        </div>
        <div className="sm:w-56">
          <Select
            value={view}
            onChange={(event) => {
              setView(event.target.value as typeof view);
              setPage(1);
            }}
            aria-label="Which designs"
          >
            <option value="all">Every design</option>
            <option value="needsCustomer">Needs a customer</option>
            <option value="quoted">Ever quoted</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading designs…" />
      ) : rows.length === 0 ? (
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title={
              view === 'needsCustomer' ? 'Every design has a customer' : 'Nothing matches that'
            }
            description={
              view === 'needsCustomer'
                ? 'Nothing is waiting to be claimed.'
                : 'Try a different search, or show every design.'
            }
          />
        </div>
      ) : (
        <>
          <div className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="text-ink-500 border-ink-200 border-b text-left text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Design</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Structure</th>
                    <th className="px-4 py-2.5 font-medium">Colours</th>
                    <th className="px-4 py-2.5 text-right font-medium">Quoted</th>
                    <th className="px-4 py-2.5 font-medium">Has</th>
                  </tr>
                </thead>
                <tbody className="divide-ink-100 divide-y">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() =>
                        row.customerId
                          ? navigate(`/customers/${row.customerId}`)
                          : canEdit && setAssigning(row)
                      }
                      className={cn(
                        'hover:bg-ink-25 cursor-pointer',
                        row.needsCustomer && 'bg-warning-50/40',
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="text-ink-900 font-medium">{row.jobName}</div>
                        <div className="text-ink-400 text-xs">
                          {row.jobCode}
                          {row.jobType && row.jobType !== 'NA' ? ` · ${row.jobType}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {row.customerName ? (
                          <span className="text-ink-700">{row.customerName}</span>
                        ) : (
                          <Badge tone="warning">Needs a customer</Badge>
                        )}
                      </td>
                      <td className="text-ink-600 px-4 py-2.5 text-xs tabular-nums">
                        {row.structure}
                      </td>
                      <td className="text-ink-600 px-4 py-2.5 text-xs">{row.colours}</td>
                      <td className="text-ink-700 px-4 py-2.5 text-right tabular-nums">
                        {row.quotedTimes > 0 ? (
                          <>
                            {row.quotedTimes}
                            {row.lastQuotedOn ? (
                              <div className="text-ink-400 text-xs">{row.lastQuotedOn}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-ink-300">never</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          {row.hasCylinders ? (
                            <Disc3 className="text-ink-500 size-4" aria-label="Has cylinders" />
                          ) : null}
                          {row.hasArtwork ? (
                            <Image className="text-ink-500 size-4" aria-label="Has artwork" />
                          ) : null}
                          {!row.hasCylinders && !row.hasArtwork ? (
                            <span className="text-ink-300 text-xs">—</span>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pages > 1 ? (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-ink-500 text-sm">
                {data?.total} designs · page {page} of {pages}
              </span>
              <span className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Back
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </span>
            </div>
          ) : null}
        </>
      )}

      <AssignCustomer design={assigning} onClose={() => setAssigning(null)} />
    </div>
  );
}

/**
 * Putting a customer to a design that arrived without one.
 *
 * Searched rather than listed. A dropdown of every customer was the first
 * attempt and it came back **empty** — it asked for 500 and the API caps a
 * page at 100, so the whole request failed validation and the only option was
 * the placeholder. Capping the ask at 100 would have worked today, with
 * seventy customers, and silently dropped the rest on the day there were more.
 */
function AssignCustomer({
  design,
  onClose,
}: {
  design: DesignMasterRow | null;
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const assign = useAssignDesignCustomer();
  const search = useDebounce(query, 250);
  const { data: customers } = useCustomers({ page: 1, pageSize: 25, q: search || undefined });

  const options = (customers?.items ?? []).map((customer) => ({
    key: customer.id,
    label: customer.companyName,
  }));

  /*
   * Cleared for each design opened.
   *
   * The dialog stays mounted between designs — it returns null rather than
   * unmounting — so without this the box kept whatever was typed last time.
   * Opening a second design and typing showed "SamantSamant" and matched
   * nothing, which reads as the search being broken.
   */
  useEffect(() => {
    setQuery('');
    setCustomerId('');
  }, [design?.id]);

  async function save() {
    if (!design || !customerId) return;
    try {
      await assign.mutateAsync({ id: design.id, input: { customerId } });
      toast.success('Design assigned — it is on that customer now');
      setCustomerId('');
      setQuery('');
      onClose();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not assign it');
    }
  }

  if (!design) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Whose design is this?"
      description={`${design.jobName} — ${design.jobCode}. It came off the old sheets with nobody's name on it.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!customerId}
            loading={assign.isPending}
            onClick={() => void save()}
          >
            <UserPlus className="size-4" />
            It is theirs
          </Button>
        </>
      }
    >
      <Field
        label="Customer"
        htmlFor="assign-customer"
        hint="Afterwards it is edited on their page, like every other design"
      >
        <Combobox
          id="assign-customer"
          options={options}
          value={query}
          placeholder="Type a company…"
          onChange={(next) => {
            setQuery(next);
            /* Typing after a choice clears it, or the box would read one
               customer while the form held another. */
            if (customerId) setCustomerId('');
          }}
          onPick={(label, key) => {
            setQuery(label);
            setCustomerId(key);
          }}
          /* The server already searched, on company AND brand — filtering the
             result again by company name would throw away a brand match. */
          filterLocally={false}
        />
      </Field>
    </Modal>
  );
}
