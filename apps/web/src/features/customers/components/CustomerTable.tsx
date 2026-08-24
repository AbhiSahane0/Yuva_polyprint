import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from 'lucide-react';
import type { Customer } from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { CustomerListParams } from '../api/customer-api';

type SortBy = NonNullable<CustomerListParams['sortBy']>;

interface Props {
  customers: Customer[];
  sortBy: SortBy;
  sortOrder: 'asc' | 'desc';
  onSort: (column: SortBy) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  /** Dims the table while a new page or search is loading. */
  isFetching: boolean;
}

/** Renders the legacy 'NA' placeholder as a muted dash instead of the word. */
function Value({ value, className }: { value: string; className?: string }) {
  if (!value || value === 'NA') return <span className="text-ink-300">—</span>;
  return <span className={className}>{value}</span>;
}

function SortButton({
  column,
  label,
  sortBy,
  sortOrder,
  onSort,
}: {
  column: SortBy;
  label: string;
  sortBy: SortBy;
  sortOrder: 'asc' | 'desc';
  onSort: (column: SortBy) => void;
}) {
  const active = sortBy === column;
  const Icon = !active ? ArrowUpDown : sortOrder === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'inline-flex items-center gap-1 hover:text-ink-900',
        active ? 'text-ink-900' : 'text-ink-500',
      )}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <Icon className="size-3.5" />
    </button>
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
        className="text-ink-500 hover:bg-brand-50 hover:text-brand-700 rounded-[var(--radius-md)] p-2"
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(customer)}
        aria-label={`Delete ${customer.companyName}`}
        title="Delete"
        className="text-ink-500 hover:bg-danger-50 hover:text-danger-600 rounded-[var(--radius-md)] p-2"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

export function CustomerTable({
  customers,
  sortBy,
  sortOrder,
  onSort,
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
            <tr className="border-ink-200 bg-ink-25 border-b text-left">
              <th scope="col" className="px-4 py-3 font-semibold">
                <SortButton
                  column="companyName"
                  label="Company"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
              </th>
              <th scope="col" className="text-ink-500 px-4 py-3 font-semibold">
                Contact
              </th>
              <th scope="col" className="text-ink-500 px-4 py-3 font-semibold">
                Mobile
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                <SortButton
                  column="city"
                  label="City"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
              </th>
              <th scope="col" className="text-ink-500 px-4 py-3 text-right font-semibold">
                Jobs
              </th>
              <th scope="col" className="text-ink-500 px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-ink-100 hover:bg-ink-25 border-b">
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
                  <div className="flex flex-wrap gap-1">
                    {customer.isVerified ? (
                      <Badge tone="success">Confirmed</Badge>
                    ) : (
                      <Badge tone="warning">Needs review</Badge>
                    )}
                    {customer.source === 'BRAND_INFERRED' ? (
                      <Badge tone="brand" className="whitespace-nowrap">
                        From brand
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RowActions customer={customer} onEdit={onEdit} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Mobile: cards, not a squeezed table ---------- */}
      <ul className="divide-ink-100 divide-y md:hidden">
        {customers.map((customer) => (
          <li key={customer.id} className="flex items-start justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-ink-900 text-sm font-medium">{customer.companyName}</p>
              <p className="text-ink-500 mt-1 text-xs tabular-nums">
                <Value value={customer.mobile} />
                {customer.city !== 'NA' ? ` · ${customer.city}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {customer.isVerified ? (
                  <Badge tone="success">Confirmed</Badge>
                ) : (
                  <Badge tone="warning">Needs review</Badge>
                )}
                {customer.source === 'BRAND_INFERRED' ? (
                  <Badge tone="brand">From brand</Badge>
                ) : null}
                <Badge>
                  {customer.jobCount} job{customer.jobCount === 1 ? '' : 's'}
                </Badge>
              </div>
            </div>
            <RowActions customer={customer} onEdit={onEdit} onDelete={onDelete} />
          </li>
        ))}
      </ul>
    </div>
  );
}
