import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Save } from 'lucide-react';
import { dispatchDateFrom, formatNumber, type JobCard, type JobCardInput } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { ApiClientError } from '@/lib/api-client';
import { openBlobUrl, saveBlob } from '@/lib/download';
import { toast } from '@/lib/toast';
import { useOrders } from '@/features/orders/api/order-api';
import { useSettings } from '@/features/quotations/api/quotation-api';
import { JobCardForm } from '../components/JobCardForm';
import { fetchJobCardPdf, jobCardPdfName, useJobCard, useUpdateJobCard } from '../api/job-card-api';

/** Everything on the card the office can change. */
type Draft = JobCard;

/**
 * **One job card.**
 *
 * The work instruction, and nothing else. What the run turns out to consume is
 * a job sheet — a different document, written afterwards by the people who
 * ran the job, on its own screen. Keeping them apart is the point: this one is
 * printed and signed before anybody touches a machine.
 *
 * Almost nothing here is typed. Point the card at an order and the design
 * behind it fills in the structure, the sizes, the weights, the metreage and
 * the times; the yellow boxes are the handful of things only the setter knows.
 */
export default function JobCardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useJobCard(id);
  const save = useUpdateJobCard(id ?? '');

  const [draft, setDraft] = useState<Draft | null>(null);
  const [preparingCard, setPreparingCard] = useState(false);
  const cardUrl = useRef<string | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  useEffect(
    () => () => {
      if (cardUrl.current) URL.revokeObjectURL(cardUrl.current);
    },
    [],
  );

  /* Orders a card can be raised against. A hundred is the server's cap, and
     the works has a few dozen open at a time. */
  const { data: orders } = useOrders({ pageSize: 100 });

  /* The works' figures as at THIS card's date, so a card printed last week
     goes on saying the times the setter was actually given. */
  const { data: settings } = useSettings(draft?.date);

  const orderOptions = useMemo(() => orders?.items ?? [], [orders]);
  const lead = settings?.dispatchLeadDays ?? 15;

  if (isLoading || !draft) return <LoadingState label="Loading the job card…" />;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  /**
   * Picking the order fills the card in **here and now**.
   *
   * The server does the same on save, and that is what is stored — but a card
   * that stays blank until somebody presses Save reads as one that did not
   * understand the question. Everything taken is the order's own: its design,
   * its customer, its quantity and the day they ordered.
   *
   * Only blanks are filled. A quantity somebody typed is a part delivery, and
   * a card for less than the order is a real card.
   */
  function pickOrder(orderId: string | null) {
    const picked = orderOptions.find((order) => order.id === orderId) ?? null;

    setDraft((current) => {
      if (!current) return current;
      if (!picked) return { ...current, orderId: null, orderNumber: null };

      const poDate = current.poDate ?? picked.orderDate;
      return {
        ...current,
        orderId: picked.id,
        orderNumber: picked.number,
        jobId: picked.jobId,
        jobName: picked.jobName,
        customerId: picked.customerId,
        customerName: picked.customerName,
        quantityKg: current.quantityKg > 0 ? current.quantityKg : picked.quantityKg,
        poDate,
        dispatchDate: current.dispatchDate ?? (poDate ? dispatchDateFrom(poDate, lead) : null),
      };
    });
  }

  const payload = (): Partial<JobCardInput> => ({
    date: draft.date,
    orderId: draft.orderId,
    jobId: draft.jobId,
    customerId: draft.customerId,
    jobName: draft.jobName,

    workOrderNo: draft.workOrderNo,
    poDate: draft.poDate,
    dispatchDate: draft.dispatchDate,
    transport: draft.transport,
    quantityKg: draft.quantityKg,
    jobReceivedBy: draft.jobReceivedBy,
    printingNote: draft.printingNote,
    printSpeedMPerMin: draft.printSpeedMPerMin,
    printMetersOverride: draft.printMetersOverride,
    metPetCoatingGsm: draft.metPetCoatingGsm,
    polyCoatingGsm: draft.polyCoatingGsm,
    pouchingSpeedPerMin: draft.pouchingSpeedPerMin,
    otherSettingMinutes: draft.otherSettingMinutes,
    singleRollWeight: draft.singleRollWeight,
    pouchSorting: draft.pouchSorting,
    specialInstructions: draft.specialInstructions,
    preparedBy: draft.preparedBy,
    operatedBy: draft.operatedBy,
    approvedBy: draft.approvedBy,
  });

  /** Reports whether the card is now saved, so printing can wait for it. */
  async function onSave(): Promise<boolean> {
    try {
      await save.mutateAsync(payload());
      toast.success('Job card saved');
      return true;
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the card');
      return false;
    }
  }

  /**
   * The card, on paper.
   *
   * **Saved first.** The PDF is rendered by the server from the stored card,
   * so printing an unsaved screen would hand the floor a speed nobody typed —
   * and a card is believed, which is the whole point of printing it.
   */
  async function onPrint() {
    if (!(await onSave())) return;

    setPreparingCard(true);
    try {
      const { blob, filename } = await fetchJobCardPdf(draft!.id);

      /* One object URL, revoked when this page unloads — revoking it now would
         pull the document out from under the tab that is showing it. */
      if (cardUrl.current) URL.revokeObjectURL(cardUrl.current);
      cardUrl.current = URL.createObjectURL(blob);

      if (!openBlobUrl(cardUrl.current)) {
        saveBlob(blob, jobCardPdfName(filename, draft!.number));
        toast.success('Your browser blocked the new tab, so the card was downloaded instead');
      }
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not print the card');
    } finally {
      setPreparingCard(false);
    }
  }

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" onClick={() => navigate('/job-cards')} aria-label="Back">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-ink-900 text-xl font-semibold">Job card {draft.number}</h1>
            <p className="text-ink-500 mt-0.5 text-sm">
              {draft.jobName || 'No design yet'}
              {draft.customerName ? ` · ${draft.customerName}` : ''}
              {draft.orderNumber !== null ? ` · order #${draft.orderNumber}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onSave} disabled={save.isPending}>
            <Save className="size-4" />
            Save
          </Button>
          {/* The card is only worked out where it knows its design. */}
          <Button
            onClick={onPrint}
            disabled={!draft.jobId || preparingCard || save.isPending}
            title={
              draft.jobId
                ? 'Saves the card, then opens it to print'
                : 'Point the card at an order first — every figure on it is worked out from that design'
            }
          >
            <Printer className="size-4" />
            {preparingCard ? 'Preparing…' : 'Print card'}
          </Button>
        </div>
      </header>

      {/*
        What the card is for.

        One question, because answering it answers the rest: the order knows
        the design, the customer and the quantity, and the design knows
        everything the card works out.
      */}
      <section className="border-ink-200 rounded-lg border bg-white p-4">
        <Field
          label="Against which order"
          htmlFor="orderId"
          hint="The design, the customer and the quantity come with it"
        >
          <Select
            id="orderId"
            value={draft.orderId ?? ''}
            onChange={(event) => pickOrder(event.target.value || null)}
          >
            <option value="">Not against an order</option>
            {orderOptions.map((order) => (
              <option key={order.id} value={order.id}>
                #{order.number} — {order.customerName} · {order.jobName} ·{' '}
                {formatNumber(order.quantityKg, 0)} kg
              </option>
            ))}
          </Select>
        </Field>
      </section>

      <JobCardForm
        draft={draft as unknown as JobCardInput}
        jobId={draft.jobId}
        rates={{
          cylinderChangeoverMinutes: settings?.cylinderChangeoverMinutes ?? 15,
          rubberChangeMinutes: settings?.rubberChangeMinutes ?? 10,
          jobCardAllowancePercent: settings?.jobCardAllowancePercent ?? 10,
          dispatchLeadDays: settings?.dispatchLeadDays ?? 15,
        }}
        disabled={false}
        onChange={(key, value) => set(key as keyof Draft, value as never)}
      />
    </div>
  );
}
