import { Fragment } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { Customer } from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useCustomer } from '../api/customer-api';

interface Props {
  customers: Customer[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  /** Dims the table while a new page or search is loading. */
  isFetching: boolean;
}

/** Renders the legacy 'NA' placeholder as a muted dash instead of the word. */
function Value({ value }: { value: string }) {
  if (!value || value === 'NA') return <span className="text-ink-300">—</span>;
  return <>{value}</>;
}

/** Jobs for one customer, loaded only when the row is opened. */
function JobList({ customerId }: { customerId: string }) {
  const { data, isPending, isError } = useCustomer(customerId);

  if (isPending) {
    return (
      <div className="text-ink-400 flex items-center gap-2 px-4 py-3 text-sm">
        <Spinner size="sm" />
        Loading jobs…
      </div>
    );
  }
  if (isError) {
    return <p className="text-danger-600 px-4 py-3 text-sm">Could not load jobs.</p>;
  }
  if (data.jobs.length === 0) {
    return (
      <p className="text-ink-500 px-4 py-3 text-sm">
        No jobs yet. Use Edit to add this customer&rsquo;s jobs.
      </p>
    );
  }

  return (
    <div className="px-4 py-3">
      <p className="text-ink-400 mb-2 text-xs font-semibold tracking-wider uppercase">
        Jobs ({data.jobs.length})
      </p>
      <ul className="divide-ink-100 border-ink-200 divide-y overflow-hidden rounded-[var(--radius-md)] border bg-white">
        {data.jobs.map((job) => {
          // A one-line structure summary: the numbers people actually scan for.
          const structure = [
            job.petMicron ? `PET ${job.petMicron}µ` : null,
            job.metPetMicron && Number(job.metPetMicron) > 0
              ? `Met PET ${job.metPetMicron}µ`
              : null,
            job.polyMicron ? `Poly ${job.polyMicron}µ` : null,
            job.compositeGsm ? `${job.compositeGsm} GSM` : null,
            job.designHeight && job.designOpenWidth
              ? `${job.designHeight} × ${job.designOpenWidth} mm`
              : null,
            job.jobColours !== 'NA' ? job.jobColours : null,
          ].filter(Boolean);

          return (
            <li key={job.id} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-ink-400 w-28 shrink-0 font-mono text-xs">
                  <Value value={job.jobCode} />
                </span>
                <span className="text-ink-800 min-w-0 flex-1 font-medium">{job.jobName}</span>
                <Badge>{job.jobType === 'NA' ? 'Type not set' : job.jobType}</Badge>
                {job.pouchType !== 'NA' ? <Badge tone="neutral">{job.pouchType}</Badge> : null}
              </div>
              {structure.length > 0 ? (
                <p className="text-ink-500 mt-1 text-xs sm:pl-[7.75rem]">
                  {structure.join('  ·  ')}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RowActions({
  customer,
  onEdit,
  onDelete,
}: Pick<Props, 'onEdit' | 'onDelete'> & { customer: Customer }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onEdit(customer)}
        aria-label={`Edit ${customer.companyName}`}
        title="Edit"
        className="text-ink-500 hover:bg-brand-50 hover:text-brand-700 cursor-pointer rounded-[var(--radius-md)] p-2"
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(customer)}
        aria-label={`Delete ${customer.companyName}`}
        title="Delete"
        className="text-ink-500 hover:bg-danger-50 hover:text-danger-600 cursor-pointer rounded-[var(--radius-md)] p-2"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function StatusBadges({ customer }: { customer: Customer }) {
  return (
    <div className="flex flex-wrap gap-1">
      {customer.isVerified ? (
        <Badge tone="success">Confirmed</Badge>
      ) : (
        <Badge tone="warning">Needs review</Badge>
      )}
      {customer.source === 'BRAND_INFERRED' ? <Badge tone="brand">From brand</Badge> : null}
    </div>
  );
}

export function CustomerTable({
  customers,
  expandedId,
  onToggleExpand,
  onEdit,
  onDelete,
  isFetching,
}: Props) {
  return (
    <div className={cn('transition-opacity', isFetching && 'opacity-60')}>
      {/* ---------- Desktop: real table ---------- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
              <th scope="col" className="w-8 px-2 py-3">
                <span className="sr-only">Expand</span>
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Company
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Contact
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Mobile
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                City
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Jobs
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const expanded = expandedId === customer.id;
              return (
                <Fragment key={customer.id}>
                  <tr
                    onClick={() => onToggleExpand(customer.id)}
                    className={cn(
                      'border-ink-100 cursor-pointer border-b',
                      expanded ? 'bg-brand-50/40' : 'hover:bg-ink-25',
                    )}
                  >
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleExpand(customer.id);
                        }}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Hide' : 'Show'} jobs for ${customer.companyName}`}
                        className="text-ink-400 hover:text-ink-700 cursor-pointer rounded p-1"
                      >
                        {expanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink-900 font-medium">{customer.companyName}</p>
                      <p className="text-ink-400 mt-0.5 line-clamp-1 text-xs">
                        {customer.address === 'NA' ? '—' : customer.address}
                      </p>
                    </td>
                    <td className="text-ink-600 px-4 py-3">
                      <Value value={customer.contactPerson} />
                    </td>
                    <td className="text-ink-600 px-4 py-3 tabular-nums">
                      <Value value={customer.mobile} />
                    </td>
                    <td className="text-ink-600 px-4 py-3">
                      <Value value={customer.city} />
                    </td>
                    <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                      {customer.jobCount}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadges customer={customer} />
                    </td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <RowActions customer={customer} onEdit={onEdit} onDelete={onDelete} />
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-ink-100 bg-ink-25 border-b">
                      <td colSpan={8} className="p-0">
                        <JobList customerId={customer.id} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- Mobile: cards, not a squeezed table ---------- */}
      <ul className="divide-ink-100 divide-y md:hidden">
        {customers.map((customer) => {
          const expanded = expandedId === customer.id;
          return (
            <li key={customer.id}>
              <div
                onClick={() => onToggleExpand(customer.id)}
                className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink-900 text-sm font-medium">{customer.companyName}</p>
                  <p className="text-ink-500 mt-1 text-xs tabular-nums">
                    <Value value={customer.mobile} />
                    {customer.city !== 'NA' ? ` · ${customer.city}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <StatusBadges customer={customer} />
                    <Badge>
                      {customer.jobCount} job{customer.jobCount === 1 ? '' : 's'}
                    </Badge>
                  </div>
                </div>
                <div onClick={(event) => event.stopPropagation()}>
                  <RowActions customer={customer} onEdit={onEdit} onDelete={onDelete} />
                </div>
              </div>
              {expanded ? (
                <div className="bg-ink-25 border-ink-100 border-t">
                  <JobList customerId={customer.id} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
