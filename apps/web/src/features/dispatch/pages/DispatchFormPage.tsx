import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Truck } from 'lucide-react';
import {
  formatNumber,
  packagesNetKg,
  type CreateDispatchInput,
  type ReadyToSend,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { useCustomer } from '@/features/customers/api/customer-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { PackagesEditor, toPackageInputs, type PackageDraft } from '../components/PackagesEditor';
import {
  useCreateDispatch,
  useDispatch,
  useNextDispatchNumber,
  useReadyToSend,
  useUpdateDispatch,
} from '../api/dispatch-api';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** One order picked for the lorry, as it is being typed. */
interface LineDraft {
  orderId: string;
  /** Used only where no reels are listed. */
  quantityKg: string;
  quantityPouches: string;
  remarks: string;
  packages: PackageDraft[];
}

/**
 * **Loading a lorry.**
 *
 * The page is built the way the job is done: pick who it is going to, tick what
 * is going, write down the reels, then say which lorry. Nothing else is offered,
 * because nothing else is a decision at the loading bay.
 *
 * What can be picked is **what is actually standing in the godown** — made and
 * not yet gone, worked out from the finished runs and the notes already sent. An
 * order that has nothing behind it cannot be put on a lorry here, which is the
 * honest answer rather than a validation message later.
 *
 * It saves a **draft**. A draft counts for nothing anywhere: no order is
 * credited and no figure moves until somebody presses Dispatch on the note
 * itself, with the lorry in front of them.
 *
 * The same page corrects a draft, because it is the same job with the answers
 * already filled in. Only a draft — once a lorry has gone the note is the record
 * of what went on it, and the server refuses to edit it.
 */
export default function DispatchFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { id } = useParams();
  const editing = Boolean(id);

  const { data: queue, isLoading } = useReadyToSend();
  const { data: next } = useNextDispatchNumber();
  const { data: existing, isLoading: loadingNote } = useDispatch(id ?? null);
  const create = useCreateDispatch();
  const update = useUpdateDispatch();

  const [customerKey, setCustomerKey] = useState(params.get('customerId') ?? '');
  const [lines, setLines] = useState<LineDraft[]>([]);

  const [dispatchDate, setDispatchDate] = useState(todayIso());
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [transporter, setTransporter] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [notes, setNotes] = useState('');

  const rows = queue ?? [];

  /*
   * One note, one customer — each customer signs for their own goods. So the
   * choice comes first and everything below follows from it, rather than letting
   * two customers' orders be ticked and refused on save.
   */
  const customers = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; orders: number; readyKg: number }>();
    for (const row of rows) {
      const key = row.customerId ?? `name:${row.customerName}`;
      const at = seen.get(key) ?? { key, name: row.customerName, orders: 0, readyKg: 0 };
      at.orders += 1;
      at.readyKg += row.readyKg;
      seen.set(key, at);
    }
    /* A draft's own customer stays choosable even once their queue is empty,
       so a saved note can always be reopened and read. */
    if (existing) {
      const key = existing.customerId ?? `name:${existing.customerName}`;
      if (!seen.has(key))
        seen.set(key, { key, name: existing.customerName, orders: 0, readyKg: 0 });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, existing]);

  const chosen = customers.find((customer) => customer.key === customerKey) ?? null;

  /*
   * What can be ticked: the godown queue for this customer, plus anything this
   * draft already names.
   *
   * The second half matters. An order can drop off the queue while a draft sits
   * there — another lorry took the rest of it — and a line silently disappearing
   * from the form would silently disappear from the note on save. It stays,
   * showing nothing ready, and posting will refuse it and say why.
   */
  const forCustomer = useMemo(() => {
    const queued = rows.filter(
      (row) => (row.customerId ?? `name:${row.customerName}`) === customerKey,
    );
    if (!existing) return queued;
    const known = new Set(queued.map((row) => row.orderId));
    const missing = existing.lines
      .filter((line) => !known.has(line.orderId))
      .map(
        (line) =>
          ({
            orderId: line.orderId,
            orderNumber: line.orderNumber,
            orderStatus: line.orderStatus,
            customerId: existing.customerId,
            customerName: existing.customerName,
            jobId: line.jobId,
            jobName: line.jobName,
            customerPoNumber: line.customerPoNumber,
            dueDate: null,
            isOverdue: false,
            orderedKg: line.orderedKg,
            orderedPouches: line.quantityPouches,
            producedKg: line.producedKg,
            producedPouches: 0,
            dispatchedKg: line.dispatchedKg,
            dispatchedPouches: 0,
            readyKg: Math.max(0, line.producedKg - line.dispatchedKg),
            readyPouches: 0,
            pendingKg: line.pendingKg,
            percentDispatched: 0,
            ratePerKg: 0,
            ratePerPouch: 0,
            cards: [],
          }) satisfies ReadyToSend,
      );
    return [...queued, ...missing];
  }, [rows, customerKey, existing]);

  /* The address the goods actually go to, prefilled from the customer and then
     the clerk's to correct — a delivery often goes somewhere else entirely. */
  const customerId = chosen && !chosen.key.startsWith('name:') ? chosen.key : null;
  const { data: customer } = useCustomer(customerId);
  useEffect(() => {
    if (customer?.address) setDeliveryAddress(customer.address);
  }, [customer?.address]);

  /*
   * Filling the form in from a draft being corrected.
   *
   * Keyed on the note's id so it runs once per note and never fights what is
   * being typed afterwards.
   */
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!existing || hydrated.current === existing.id) return;
    hydrated.current = existing.id;

    const key = existing.customerId ?? `name:${existing.customerName}`;
    linesBelongTo.current = key;
    setCustomerKey(key);
    setDispatchDate(existing.dispatchDate);
    setDeliveryAddress(existing.deliveryAddress);
    setVehicleNumber(existing.vehicleNumber);
    setTransporter(existing.transporter);
    setDriverName(existing.driverName);
    setDriverPhone(existing.driverPhone);
    setLrNumber(existing.lrNumber);
    setNotes(existing.notes);
    setLines(
      existing.lines.map((line) => ({
        orderId: line.orderId,
        quantityKg: String(line.quantityKg),
        quantityPouches: line.quantityPouches > 0 ? String(line.quantityPouches) : '',
        remarks: line.remarks,
        packages: line.packages.map((pack) => ({
          reelNumber: pack.reelNumber,
          netKg: String(pack.netKg),
          widthMm: pack.widthMm === null ? '' : String(pack.widthMm),
        })),
      })),
    );
  }, [existing]);

  /*
   * Changing who it is going to cannot leave the previous customer's orders on
   * the note. Tracked against the customer the lines actually belong to rather
   * than fired on every change, or filling the form in from a draft would wipe
   * the lines it had just put there.
   */
  const linesBelongTo = useRef(customerKey);
  useEffect(() => {
    if (linesBelongTo.current === customerKey) return;
    linesBelongTo.current = customerKey;
    setLines([]);
  }, [customerKey]);

  function toggle(order: ReadyToSend) {
    setLines((was) =>
      was.some((line) => line.orderId === order.orderId)
        ? was.filter((line) => line.orderId !== order.orderId)
        : [
            ...was,
            {
              orderId: order.orderId,
              /* Everything standing in the godown, which is what a lorry
                 usually takes. Typed down when it does not. */
              quantityKg: String(order.readyKg),
              quantityPouches: order.readyPouches > 0 ? String(order.readyPouches) : '',
              remarks: '',
              packages: [],
            },
          ],
    );
  }

  const setLine = (orderId: string, patch: Partial<LineDraft>) =>
    setLines((was) => was.map((line) => (line.orderId === orderId ? { ...line, ...patch } : line)));

  /** What a line is sending, reels first. Mirrors `lineNetKg` on the server. */
  const netOf = (line: LineDraft): number => {
    const listed = toPackageInputs(line.packages);
    return listed.length > 0 ? packagesNetKg(listed) : Number(line.quantityKg) || 0;
  };

  const totalKg = lines.reduce((sum, line) => sum + netOf(line), 0);
  const canSave = lines.length > 0 && lines.every((line) => netOf(line) > 0);

  async function save() {
    if (!chosen) return;
    const input: CreateDispatchInput = {
      customerId,
      customerName: chosen.name,
      dispatchDate,
      deliveryAddress,
      vehicleNumber,
      transporter,
      driverName,
      driverPhone,
      lrNumber,
      notes,
      lines: lines.map((line) => ({
        orderId: line.orderId,
        productionOrderId: null,
        quantityKg: Number(line.quantityKg) || 0,
        quantityPouches: Number(line.quantityPouches) || 0,
        remarks: line.remarks,
        packages: toPackageInputs(line.packages),
      })),
    };
    try {
      const note = existing
        ? await update.mutateAsync({ id: existing.id, input })
        : await create.mutateAsync(input);
      toast.success(
        existing
          ? `Dispatch note ${note.number} updated`
          : `Dispatch note ${note.number} saved as a draft`,
      );
      navigate(`/dispatch/${note.id}`);
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save the note');
    }
  }

  if (isLoading || (editing && loadingNote)) {
    return (
      <LoadingState label={editing ? 'Loading the draft…' : 'Looking at what is ready to go…'} />
    );
  }

  /* A note that has gone out is a record, not a form. The server refuses the
     write too; this is the same refusal before anything is typed. */
  if (existing && existing.status !== 'DRAFT') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title={`Note #${existing.number} has already gone out`}
            description="A note that has left the works is the record of what went on the lorry, so it cannot be edited. Cancel it and raise the one that went."
            action={
              <Button variant="secondary" onClick={() => navigate(`/dispatch/${existing.id}`)}>
                Open the note
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <button
        type="button"
        onClick={() => navigate(existing ? `/dispatch/${existing.id}` : '/dispatch')}
        className="text-ink-500 hover:text-ink-800 mb-4 flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" />
        Dispatch
      </button>

      <header className="mb-6">
        <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">
          {existing ? `Dispatch note #${existing.number}` : 'New dispatch note'}
          {!existing && next ? (
            <span className="text-ink-400 ml-2 font-normal">#{next.number}</span>
          ) : null}
        </h1>
        <p className="text-ink-500 mt-0.5 max-w-2xl text-sm">
          One note is one lorry. Tick what is going, list the reels, and say which vehicle. It saves
          as a draft — nothing is credited to any order until you press Dispatch.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="Nothing is waiting to go"
            description="An order appears here once a job card against it is finished. Nothing can be dispatched before something has been made."
            action={
              <Button variant="secondary" onClick={() => navigate('/production')}>
                Production
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
            <Field
              label="Going to"
              htmlFor="dispatch-customer"
              hint="One note, one customer — each signs for their own goods"
            >
              <Select
                id="dispatch-customer"
                value={customerKey}
                onChange={(event) => setCustomerKey(event.target.value)}
              >
                <option value="">Choose a customer…</option>
                {customers.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.name} — {option.orders} order{option.orders === 1 ? '' : 's'},{' '}
                    {formatNumber(option.readyKg, 0)} kg ready
                  </option>
                ))}
              </Select>
            </Field>
          </section>

          {chosen ? (
            <>
              <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
                <h2 className="text-ink-800 mb-1 text-xs font-semibold tracking-wider uppercase">
                  What is going
                </h2>
                <p className="text-ink-500 mb-3 text-sm">
                  Ready is what has been made less what has already gone. Tick an order and it
                  starts at all of it.
                </p>

                <div className="space-y-2">
                  {forCustomer.map((order) => {
                    const line = lines.find((row) => row.orderId === order.orderId) ?? null;
                    return (
                      <div
                        key={order.orderId}
                        className={cn(
                          'rounded-[var(--radius-md)] border p-3',
                          line ? 'border-brand-300 bg-brand-50/40' : 'border-ink-200',
                        )}
                      >
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="accent-brand-600 mt-1 size-4"
                            checked={Boolean(line)}
                            onChange={() => toggle(order)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-ink-900 text-sm font-medium">
                                #{order.orderNumber} · {order.jobName}
                              </span>
                              {order.isOverdue ? <Badge tone="danger">Past due</Badge> : null}
                            </span>
                            <span className="text-ink-500 mt-0.5 block text-xs tabular-nums">
                              {formatNumber(order.orderedKg, 0)} kg ordered ·{' '}
                              {formatNumber(order.producedKg, 0)} kg made ·{' '}
                              {formatNumber(order.dispatchedKg, 0)} kg gone ·{' '}
                              <span className="text-ink-800 font-semibold">
                                {formatNumber(order.readyKg, 3)} kg ready
                              </span>
                            </span>
                          </span>
                        </label>

                        {line ? (
                          <div className="border-ink-200 mt-3 space-y-3 border-t pt-3 pl-7">
                            <PackagesEditor
                              rows={line.packages}
                              onChange={(packages) => setLine(order.orderId, { packages })}
                            />

                            {/* Only where the reels are not listed — otherwise the
                                rows above are the total and this would be a second
                                figure to keep in step. */}
                            {toPackageInputs(line.packages).length === 0 ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field
                                  label="Weight going"
                                  htmlFor={`kg-${order.orderId}`}
                                  hint="Or list the reels above and this is their sum"
                                >
                                  <NumberInput
                                    id={`kg-${order.orderId}`}
                                    value={line.quantityKg}
                                    onChange={(event) =>
                                      setLine(order.orderId, { quantityKg: event.target.value })
                                    }
                                  />
                                </Field>
                                {order.orderedPouches > 0 ? (
                                  <Field label="Pouches" htmlFor={`pouches-${order.orderId}`}>
                                    <NumberInput
                                      id={`pouches-${order.orderId}`}
                                      value={line.quantityPouches}
                                      onChange={(event) =>
                                        setLine(order.orderId, {
                                          quantityPouches: event.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                ) : null}
                              </div>
                            ) : order.orderedPouches > 0 ? (
                              <Field label="Pouches" htmlFor={`pouches-${order.orderId}`}>
                                <NumberInput
                                  id={`pouches-${order.orderId}`}
                                  value={line.quantityPouches}
                                  onChange={(event) =>
                                    setLine(order.orderId, { quantityPouches: event.target.value })
                                  }
                                />
                              </Field>
                            ) : null}

                            <Field label="Remarks" htmlFor={`remarks-${order.orderId}`}>
                              <Input
                                id={`remarks-${order.orderId}`}
                                value={line.remarks}
                                onChange={(event) =>
                                  setLine(order.orderId, { remarks: event.target.value })
                                }
                                placeholder="Anything the customer should be told"
                              />
                            </Field>

                            {netOf(line) > order.readyKg + 0.0005 ? (
                              <p className="text-warning-800 text-sm">
                                That is {formatNumber(netOf(line) - order.readyKg, 3)} kg more than
                                the godown has against this order. It can still go, but it will ask
                                you to say why.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
                <h2 className="text-ink-800 mb-3 text-xs font-semibold tracking-wider uppercase">
                  The lorry
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Dispatch date" htmlFor="dispatch-date">
                    <Input
                      id="dispatch-date"
                      type="date"
                      value={dispatchDate}
                      onChange={(event) => setDispatchDate(event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Vehicle number"
                    htmlFor="dispatch-vehicle"
                    hint="Asked for again when it goes — the lorry often turns up later"
                  >
                    <Input
                      id="dispatch-vehicle"
                      value={vehicleNumber}
                      onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())}
                      placeholder="MH 12 AB 1234"
                    />
                  </Field>
                  <Field label="Transporter" htmlFor="dispatch-transporter">
                    <Input
                      id="dispatch-transporter"
                      value={transporter}
                      onChange={(event) => setTransporter(event.target.value)}
                    />
                  </Field>
                  <Field label="LR number" htmlFor="dispatch-lr" hint="The transporter’s own">
                    <Input
                      id="dispatch-lr"
                      value={lrNumber}
                      onChange={(event) => setLrNumber(event.target.value)}
                    />
                  </Field>
                  <Field label="Driver" htmlFor="dispatch-driver">
                    <Input
                      id="dispatch-driver"
                      value={driverName}
                      onChange={(event) => setDriverName(event.target.value)}
                    />
                  </Field>
                  <Field label="Driver’s phone" htmlFor="dispatch-driver-phone">
                    <Input
                      id="dispatch-driver-phone"
                      value={driverPhone}
                      onChange={(event) => setDriverPhone(event.target.value)}
                    />
                  </Field>
                </div>

                <div className="mt-3 grid gap-3">
                  <Field
                    label="Delivery address"
                    htmlFor="dispatch-address"
                    hint="Kept on the note, so a customer moving does not rewrite old challans"
                  >
                    <Textarea
                      id="dispatch-address"
                      rows={2}
                      value={deliveryAddress}
                      onChange={(event) => setDeliveryAddress(event.target.value)}
                    />
                  </Field>
                  <Field label="Notes" htmlFor="dispatch-notes">
                    <Textarea
                      id="dispatch-notes"
                      rows={2}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <div className="border-ink-200 sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-white/95 py-3 backdrop-blur">
                <div className="text-ink-600 text-sm tabular-nums">
                  {lines.length} order{lines.length === 1 ? '' : 's'} ·{' '}
                  <span className="text-ink-900 font-semibold">{formatNumber(totalKg, 3)} kg</span>
                </div>
                <Button
                  variant="primary"
                  disabled={!canSave}
                  loading={create.isPending || update.isPending}
                  onClick={() => void save()}
                >
                  <Truck className="size-4" />
                  {existing ? 'Save the draft' : 'Save as draft'}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
