import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users, X } from 'lucide-react';
import type { Customer } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Spinner } from '@/components/ui/Spinner';
import { useDebounce } from '@/hooks/useDebounce';
import { useCustomers, type CustomerListParams } from '../api/customer-api';
import { CustomerTable } from '../components/CustomerTable';
import { CustomerFormModal } from '../components/CustomerFormModal';
import { DeleteCustomerDialog } from '../components/DeleteCustomerDialog';
import * as XLSX from 'xlsx';
import { FileSpreadsheet } from 'lucide-react';
import { request } from '@/lib/api-client';
import type { Paginated } from '@yuva/shared';
type Filter = 'all' | 'needsReview' | 'fromBrand';

const PAGE_SIZE = 25;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'needsReview', label: 'Needs review' },
  { value: 'fromBrand', label: 'From brand' },
];

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  // Typing shouldn't fire a request per keystroke.
  const debouncedSearch = useDebounce(search, 300);

  // Any change to the result set must send the user back to page 1, or they
  // can end up stranded on a page that no longer exists.
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [debouncedSearch, filter]);

  const params = useMemo<CustomerListParams>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(filter === 'needsReview' ? { isVerified: false } : {}),
      ...(filter === 'fromBrand' ? { source: 'BRAND_INFERRED' as const } : {}),
    }),
    [page, debouncedSearch, filter],
  );

  const { data, isPending, isFetching, isError, error, refetch } = useCustomers(params);

  const customers = data?.items ?? [];
  const pagination = data?.pagination;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setFormOpen(true);
  }

  const exportCustomersToExcel = (customers: Customer[]) => {
    const data = customers.map((customer) => ({
      Company: customer.companyName,
      Brand: customer.brandName,
      Mobile: customer.mobile,
      City: customer.city,
      Address: customer.address,
      Jobs: customer.jobCount,
      Status: customer.isVerified ? 'Confirmed' : 'Needs review',
      Source: customer.source === 'BRAND_INFERRED' ? 'From brand' : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');

    XLSX.writeFile(
      workbook,
      `Yuva_Polyprint_Customers_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const exportAllCustomersToExcel = async () => {
    try {
      const pageSize = 100;
      let currentPage = 1;
      let allCustomers: Customer[] = [];
      let totalPages = 1;

      do {
        const response = await request<Paginated<Customer>>({
          url: '/customers',
          method: 'GET',
          params: {
            page: currentPage,
            pageSize,
          },
        });

        const pageCustomers = response.items ?? [];

        allCustomers = [...allCustomers, ...pageCustomers];

        totalPages = response.pagination?.totalPages ?? 1;

        currentPage++;
      } while (currentPage <= totalPages);

      if (allCustomers.length === 0) {
        alert('No customers found to export.');
        return;
      }

      // Use your existing Excel function
      exportCustomersToExcel(allCustomers);
    } catch (error) {
      console.error('Failed to export customers:', error);
      alert('Failed to export customers.');
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Customers</h1>
          <p className="text-ink-500 mt-1 text-sm">
            {pagination ? (
              `${pagination.total} customer${pagination.total === 1 ? '' : 's'}`
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Spinner size="sm" />
                Loading…
              </span>
            )}
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={exportAllCustomersToExcel}>
          <FileSpreadsheet className="size-4" />
          Export Excel
        </Button>

        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Add customer
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
            placeholder="Search company, brand, mobile, city…"
            aria-label="Search customers"
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

        <div className="border-ink-200 flex rounded-[var(--radius-md)] border bg-white p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={
                filter === option.value
                  ? 'bg-brand-600 cursor-pointer rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm font-medium text-white'
                  : 'text-ink-600 hover:text-ink-900 cursor-pointer rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 text-sm font-medium'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <section className="border-ink-200 mt-4 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
        {isError ? (
          <EmptyState
            title="Could not load customers"
            description={error instanceof Error ? error.message : 'Something went wrong.'}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : isPending ? (
          <LoadingState label="Loading customers…" />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" />}
            title={search ? 'No customers match your search' : 'No customers yet'}
            description={
              search ? 'Try a different company name, mobile number or city.' : undefined
            }
            action={
              search ? (
                <Button variant="secondary" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <Button onClick={openCreate}>
                  <Plus className="size-4" />
                  Add customer
                </Button>
              )
            }
          />
        ) : (
          <CustomerTable
            customers={customers}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId((current) => (current === id ? null : id))}
            onEdit={openEdit}
            onDelete={setDeleting}
            isFetching={isFetching}
          />
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

      <CustomerFormModal
        open={formOpen}
        customer={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <DeleteCustomerDialog customer={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
