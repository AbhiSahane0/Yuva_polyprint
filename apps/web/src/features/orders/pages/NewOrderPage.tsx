import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { formatRs, orderAmount } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Field, Input, NumberInput } from '@/components/ui/Field';
import { useDebounce } from '@/hooks/useDebounce';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useCustomers } from '@/features/customers/api/customer-api';
import { useCreateOrder, useNextOrderNumber } from '../api/order-api';

const todayIso = () => new Date().toISOString().slice(0, 10);
const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * **An order taken over the phone.**
 *
 * Most orders arrive by winning a quotation, which carries the customer, the
 * job, the quantity and the rate across on one click. This is the other way in:
 * repeat business the works takes without pricing it again, which is a real
 * part of how they work and would otherwise have no record at all.
 *
 * Deliberately short. Everything a quotation would have decided — the
 * structure, the colours, the costing — belongs to the quotation, and asking
 * for it again here would make this the slower path to the same place.
 */
export default function NewOrderPage() {
  const navigate = useNavigate();
  const create = useCreateOrder();
  const { data: next } = useNextOrderNumber();

  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [jobName, setJobName] = useState('');
  const [quantityKg, setQuantityKg] = useState('');
  const [ratePerKg, setRatePerKg] = useState('');
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [orderDate, setOrderDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const search = useDebounce(customerName, 300);
  const { data: customers } = useCustomers({ page: 1, pageSize: 20, q: search || undefined });
  const names = useMemo(
    () => (customers?.items ?? []).map((customer) => customer.companyName),
    [customers],
  );

  /* The same function the server stores it with, so the figure on the screen
     and the figure on the record cannot differ by a rounding rule. */
  const amount = orderAmount({
    quantityKg: num(quantityKg),
    ratePerKg: num(ratePerKg),
    quantityPouches: 0,
    ratePerPouch: 0,
  });

  const ready = customerName.trim().length >= 2 && jobName.trim() && num(quantityKg) > 0;

  async function save() {
    if (!ready) {
      toast.error('A customer, a job and a quantity are the least an order needs');
      return;
    }
    try {
      const order = await create.mutateAsync({
        customerId,
        customerName: customerName.trim(),
        jobId: null,
        jobName: jobName.trim(),
        quantityKg: num(quantityKg),
        ratePerKg: num(ratePerKg),
        quantityPouches: 0,
        ratePerPouch: 0,
        customerPoNumber: customerPoNumber.trim(),
        orderDate,
        dueDate: dueDate || null,
        notes: notes.trim(),
      });
      toast.success(`Order #${order.number} raised`);
      navigate(`/orders/${order.id}`);
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not raise the order');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <button
        type="button"
        onClick={() => navigate('/orders')}
        className="text-ink-500 hover:text-ink-800 mb-1 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        Orders
      </button>

      <header className="mb-6">
        <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">New order</h1>
        <p className="text-ink-500 mt-0.5 text-sm">
          {next ? `Will be number ${next.number}. ` : null}
          For repeat work taken without a fresh quotation — winning a quotation raises its orders on
          its own.
        </p>
      </header>

      <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer" htmlFor="customerName">
            <Combobox
              id="customerName"
              options={names}
              value={customerName}
              placeholder="Search or type a company…"
              filterLocally={false}
              onChange={(value) => {
                setCustomerName(value);
                /* Typed rather than picked, so it is a name and not yet a
                   record — the link is set only when one is chosen. */
                setCustomerId(null);
              }}
              onPick={(name) => {
                setCustomerName(name);
                setCustomerId(
                  (customers?.items ?? []).find((c) => c.companyName === name)?.id ?? null,
                );
              }}
            />
          </Field>

          <Field label="Job" htmlFor="jobName" hint="What is being made">
            <Input
              id="jobName"
              value={jobName}
              placeholder="e.g. Radhey Bhadang 200g"
              onChange={(event) => setJobName(event.target.value)}
            />
          </Field>

          <Field label="Quantity, kg" htmlFor="quantityKg">
            <NumberInput
              id="quantityKg"
              value={quantityKg}
              onChange={(event) => setQuantityKg(event.target.value)}
            />
          </Field>

          <Field label="Rate, Rs/kg" htmlFor="ratePerKg">
            <NumberInput
              id="ratePerKg"
              value={ratePerKg}
              onChange={(event) => setRatePerKg(event.target.value)}
            />
          </Field>

          <Field label="Ordered on" htmlFor="orderDate">
            <Input
              id="orderDate"
              type="date"
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
            />
          </Field>

          <Field label="Due" htmlFor="dueDate" hint="Leave blank if nothing is promised yet">
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>

          <Field label="Their PO number" htmlFor="customerPoNumber">
            <Input
              id="customerPoNumber"
              value={customerPoNumber}
              onChange={(event) => setCustomerPoNumber(event.target.value)}
            />
          </Field>

          <Field label="Notes" htmlFor="notes">
            <Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>

        {/* The total, as it will be stored. Shown while typing because the
            quantity and the rate are the two figures worth checking twice, and
            their product is what the customer will actually be invoiced. */}
        <div className="border-ink-200 mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div>
            <div className="text-ink-500 text-xs font-medium tracking-wide uppercase">Amount</div>
            <div className="text-ink-900 text-lg font-bold tabular-nums">{formatRs(amount)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/orders')}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={create.isPending} disabled={!ready}>
              Raise the order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
