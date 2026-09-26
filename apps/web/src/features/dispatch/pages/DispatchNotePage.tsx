import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Check, Printer, ShieldAlert, Trash2, Truck } from 'lucide-react';
import {
  DISPATCH_STATUS_LABELS,
  formatNumber,
  formatRs,
  ORDER_STATUS_LABELS,
  type DispatchStatus,
} from '@yuva/shared';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import {
  useCancelDispatch,
  useDeleteDispatch,
  useDispatch,
  usePostDispatch,
} from '../api/dispatch-api';

const TONE: Record<DispatchStatus, 'neutral' | 'success' | 'warning'> = {
  DRAFT: 'neutral',
  DISPATCHED: 'success',
  CANCELLED: 'warning',
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

/** A detail on the note. Blank ones are left out rather than shown as dashes. */
function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-ink-500 text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-ink-800 mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

/**
 * **One dispatch note — one lorry.**
 *
 * A draft until somebody presses Dispatch. That press is the only thing in the
 * module that settles anything: it stamps the lorry, and it completes every order
 * the note finishes. Which is the gap the whole module exists to close — before
 * it, a job card could be finished, costed and off stock while the order it was
 * for still read "In production", because nothing knew the goods had gone.
 */
export default function DispatchNotePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'dispatch');

  const { data: note, isLoading } = useDispatch(id);
  const post = usePostDispatch();
  const cancel = useCancelDispatch();
  const remove = useDeleteDispatch();

  const [sending, setSending] = useState(false);
  const [vehicle, setVehicle] = useState('');
  /* Revealed only when the server refuses — see `send`. */
  const [refusal, setRefusal] = useState('');
  const [override, setOverride] = useState('');

  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (isLoading || !note) return <LoadingState label="Loading the note…" />;

  const isDraft = note.status === 'DRAFT';

  function openSend() {
    setVehicle(note?.vehicleNumber ?? '');
    setRefusal('');
    setOverride('');
    setSending(true);
  }

  /**
   * Sends it, and handles the one refusal worth designing for.
   *
   * A note carrying more than the works has recorded making is refused — but it
   * is a refusal that is often wrong, because a run that packed 512 kg against a
   * 500 kg card has not said so until its job sheet is costed, and the lorry does
   * not wait for the office. So the server's own words are shown, a reason box
   * appears, and the same button sends it with that reason on the record.
   */
  async function send() {
    if (!note) return;
    try {
      await post.mutateAsync({
        id: note.id,
        input: { vehicleNumber: vehicle.toUpperCase(), overrideReason: override },
      });
      toast.success(`Note ${note.number} has gone out`);
      setSending(false);
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : 'Could not send the note';
      if (caught instanceof ApiClientError && message.includes('more than has been made')) {
        setRefusal(message);
        return;
      }
      toast.error(message);
    }
  }

  async function doCancel() {
    if (!note) return;
    try {
      await cancel.mutateAsync({ id: note.id, input: { reason } });
      toast.success(
        note.status === 'DISPATCHED'
          ? 'Cancelled — the orders it settled have been given back'
          : 'Draft cancelled',
      );
      setCancelling(false);
      setReason('');
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not cancel it');
    }
  }

  async function doDelete() {
    if (!note) return;
    try {
      await remove.mutateAsync(note.id);
      toast.success('Draft deleted');
      navigate('/dispatch');
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not delete it');
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <button
        type="button"
        onClick={() => navigate('/dispatch')}
        className="text-ink-500 hover:text-ink-800 mb-4 flex items-center gap-1.5 text-sm print:hidden"
      >
        <ArrowLeft className="size-4" />
        Dispatch
      </button>

      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">
              Dispatch note #{note.number}
            </h1>
            <Badge tone={TONE[note.status]}>{DISPATCH_STATUS_LABELS[note.status]}</Badge>
          </div>
          <p className="text-ink-600 mt-1 text-sm">
            {note.customerName} · {formatDate(note.dispatchDate)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
          {canEdit && isDraft ? (
            <>
              <Button variant="ghost" onClick={() => navigate(`/dispatch/${note.id}/edit`)}>
                Edit
              </Button>
              <Button variant="primary" onClick={openSend}>
                <Truck className="size-4" />
                Dispatch it
              </Button>
            </>
          ) : null}
          {canEdit && note.status !== 'CANCELLED' ? (
            <Button variant="secondary" onClick={() => setCancelling(true)}>
              <Ban className="size-4" />
              Cancel
            </Button>
          ) : null}
          {canEdit && isDraft ? (
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>

      {isDraft ? (
        <p className="border-ink-200 bg-ink-25 text-ink-600 mb-5 rounded-[var(--radius-md)] border px-4 py-3 text-sm print:hidden">
          This is a draft. Nothing on it counts against any order yet — no order has been credited
          and nothing has left the godown until you press <strong>Dispatch it</strong>.
        </p>
      ) : null}

      {note.status === 'CANCELLED' ? (
        <div className="border-warning-200 bg-warning-50/50 mb-5 rounded-[var(--radius-md)] border p-3">
          <div className="text-warning-800 flex items-start gap-2 text-sm">
            <Ban className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">Cancelled</div>
              <p className="mt-0.5">{note.cancelledReason}</p>
              {note.cancelledAt ? (
                <p className="text-ink-500 mt-1 text-xs">
                  {new Date(note.cancelledAt).toLocaleString('en-IN')}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {note.overrideReason ? (
        <div className="border-warning-200 bg-warning-50/50 mb-5 rounded-[var(--radius-md)] border p-3">
          <div className="text-warning-800 flex items-start gap-2 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">Sent over what was recorded as made</div>
              <p className="mt-0.5">{note.overrideReason}</p>
              <p className="text-ink-500 mt-1 text-xs">
                {note.overrideBy}
                {note.overrideAt ? ` · ${new Date(note.overrideAt).toLocaleString('en-IN')}` : ''}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="border-ink-200 mb-5 rounded-[var(--radius-lg)] border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
        <h2 className="text-ink-800 mb-3 text-xs font-semibold tracking-wider uppercase">
          The lorry
        </h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Detail label="Vehicle" value={note.vehicleNumber} />
          <Detail label="Transporter" value={note.transporter} />
          <Detail label="LR number" value={note.lrNumber} />
          <Detail label="Driver" value={note.driverName} />
          <Detail label="Driver’s phone" value={note.driverPhone} />
          <Detail
            label="Sent"
            value={
              note.dispatchedAt
                ? `${new Date(note.dispatchedAt).toLocaleString('en-IN')}${note.dispatchedBy ? ` · ${note.dispatchedBy}` : ''}`
                : ''
            }
          />
          <div className="sm:col-span-3">
            <Detail label="Delivery address" value={note.deliveryAddress} />
          </div>
          <div className="sm:col-span-3">
            <Detail label="Notes" value={note.notes} />
          </div>
        </dl>
      </section>

      <section className="border-ink-200 mb-5 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
        <div className="border-ink-200 border-b px-4 py-3 sm:px-5">
          <h2 className="text-ink-800 text-xs font-semibold tracking-wider uppercase">
            What is on it
          </h2>
        </div>

        <div className="divide-ink-100 divide-y">
          {note.lines.map((line) => (
            <div key={line.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/orders/${line.orderId}`)}
                    className="text-ink-900 text-left text-sm font-medium hover:underline"
                  >
                    #{line.orderNumber} · {line.jobName}
                  </button>
                  <div className="text-ink-500 mt-0.5 text-xs">
                    {line.customerPoNumber ? `PO ${line.customerPoNumber} · ` : ''}
                    Order is {ORDER_STATUS_LABELS[line.orderStatus].toLowerCase()}
                    {/*
                      The balance is only worth saying while somebody is still
                      waiting for it. A settled order can keep a kilogram
                      figure — a pouch order is judged on bags, so it completes
                      with its weight short — and printing "completed · 53 kg
                      still to go" beside it reads as the screen contradicting
                      itself rather than as the two different things it is.
                    */}
                    {line.pendingKg > 0 &&
                    line.orderStatus !== 'COMPLETED' &&
                    line.orderStatus !== 'CANCELLED'
                      ? ` · ${formatNumber(line.pendingKg, 3)} kg still to go`
                      : ''}
                  </div>
                  {line.remarks ? (
                    <div className="text-ink-600 mt-1 text-sm">{line.remarks}</div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="text-ink-900 text-sm font-semibold tabular-nums">
                    {formatNumber(line.quantityKg, 3)} kg
                  </div>
                  {line.quantityPouches > 0 ? (
                    <div className="text-ink-600 text-xs tabular-nums">
                      {formatNumber(line.quantityPouches, 0)} pouches
                    </div>
                  ) : null}
                  <div className="text-ink-500 text-xs tabular-nums">{formatRs(line.value)}</div>
                </div>
              </div>

              {line.packages.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {line.packages.map((pack) => (
                    <span
                      key={pack.id}
                      className="border-ink-200 text-ink-600 rounded-full border bg-white px-2 py-0.5 text-xs whitespace-nowrap tabular-nums"
                      title={`Reel ${pack.reelNumber || pack.position}`}
                    >
                      {pack.reelNumber || `#${pack.position}`}
                      {pack.widthMm ? (
                        <span className="text-ink-400"> · {formatNumber(pack.widthMm, 0)} mm</span>
                      ) : null}
                      <span className="text-ink-400"> · </span>
                      {formatNumber(pack.netKg, 1)} kg
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="border-ink-200 bg-ink-25 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm sm:px-5">
          <span className="text-ink-600">
            {note.lineCount} order{note.lineCount === 1 ? '' : 's'}
            {note.packageCount > 0 ? ` · ${note.packageCount} packages` : ''}
          </span>
          <span className="text-ink-900 font-semibold tabular-nums">
            {formatNumber(note.totalKg, 3)} kg · {formatRs(note.totalValue)}
          </span>
        </div>
      </section>

      <Modal
        open={sending}
        onClose={() => setSending(false)}
        title={`Send note #${note.number}`}
        description="The lorry’s number goes on the challan, and every order this finishes becomes completed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSending(false)}>
              Not yet
            </Button>
            <Button
              variant="primary"
              disabled={vehicle.trim().length < 4 || (Boolean(refusal) && !override.trim())}
              loading={post.isPending}
              onClick={() => void send()}
            >
              <Check className="size-4" />
              {refusal ? 'Send it anyway' : 'Dispatch it'}
            </Button>
          </>
        }
      >
        <Field label="Vehicle number" htmlFor="send-vehicle">
          <Input
            id="send-vehicle"
            value={vehicle}
            onChange={(event) => setVehicle(event.target.value.toUpperCase())}
            placeholder="MH 12 AB 1234"
          />
        </Field>

        {refusal ? (
          <div className="mt-3">
            <div className="border-warning-200 bg-warning-50/50 text-warning-800 mb-3 rounded-[var(--radius-md)] border p-3 text-sm">
              {refusal}
            </div>
            <Field
              label="Why is it going anyway?"
              htmlFor="send-override"
              hint="Recorded against the note with your name. Usually: the run packed more than its card planned and the sheet is not costed yet."
            >
              <Textarea
                id="send-override"
                rows={2}
                value={override}
                onChange={(event) => setOverride(event.target.value)}
                placeholder="Run made 512 kg against a 500 kg card — weighed at the machine"
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel note #${note.number}`}
        description={
          note.status === 'DISPATCHED'
            ? 'The goods come back into the godown, and any order this note completed goes back into production.'
            : 'A draft has been credited to nothing, so nothing is given back.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 3}
              loading={cancel.isPending}
              onClick={() => void doCancel()}
            >
              Cancel the note
            </Button>
          </>
        }
      >
        <Field label="Why did it not go?" htmlFor="cancel-reason">
          <Textarea
            id="cancel-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Turned back at the customer’s gate — godown closed"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleting}
        title={`Delete draft #${note.number}?`}
        confirmLabel="Delete it"
        loading={remove.isPending}
        onConfirm={() => void doDelete()}
        onClose={() => setDeleting(false)}
      >
        Nothing has been credited against this draft, so deleting it leaves no gap. A note that has
        already gone out cannot be deleted — it is cancelled instead, with a reason.
      </ConfirmDialog>
    </div>
  );
}
