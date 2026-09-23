import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, History, Trash2 } from 'lucide-react';
import {
  CYLINDER_EVENT_LABELS,
  CYLINDER_STATUS_LABELS,
  formatNumber,
  formatRs,
  OWNERSHIP_LABELS,
  type CylinderStatus,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { cn } from '@/lib/utils';
import { ArtworkPanel } from '@/features/artwork/components/ArtworkPanel';
import { canAccess, useAuthStore } from '@/features/auth/auth-store';
import { useDesign } from '../api/cylinder-api';
import { DeleteDesignModal } from '../components/DeleteDesignModal';
import { RecordEventModal } from '../components/RecordEventModal';

const STATUS_TONE: Record<CylinderStatus | 'NONE', 'neutral' | 'success' | 'warning' | 'brand'> = {
  IN_STORE: 'success',
  ALLOCATED: 'brand',
  IN_USE: 'brand',
  DAMAGED: 'warning',
  NEEDS_REWORK: 'warning',
  RETIRED: 'neutral',
  NONE: 'neutral',
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}-${month}-${year}`;
}

export default function DesignPage() {
  const { id } = useParams<{ id: string }>();
  const { data: design, isPending, isError, error, refetch } = useDesign(id ?? null);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canEdit = canAccess(user, 'cylinders');
  /*
   * Deleting destroys a job, which the customers module owns — the same rule
   * the API applies. Someone trusted with the cylinder register is not
   * automatically trusted to delete a customer's design record.
   */
  const canDelete = canEdit && canAccess(user, 'customers');
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Null shows the whole design's history; an id narrows it to one cylinder. */
  const [focused, setFocused] = useState<string | null>(null);

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <EmptyState
          title="Could not load this design"
          description={error instanceof Error ? error.message : 'Something went wrong.'}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (isPending || !design) return <LoadingState label="Loading design…" className="mt-8" />;

  const events = focused
    ? design.events.filter((event) => event.cylinderId === focused)
    : design.events;
  const focusedCylinder = design.cylinders.find((cylinder) => cylinder.id === focused) ?? null;
  const short =
    design.expectedCylinders !== null && design.cylinderCount < design.expectedCylinders;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="mb-6">
        <Link
          to="/cylinders"
          className="text-ink-500 hover:text-ink-800 mb-1 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          Design &amp; Cylinders
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">{design.jobName}</h1>
            <p className="text-ink-500 mt-0.5 text-sm">
              {design.customerName ?? 'No customer'} · {design.jobCode}
              {design.pouchType !== 'NA' ? ` · ${design.pouchType}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[design.status]}>
              {design.status === 'NONE' ? 'No set' : CYLINDER_STATUS_LABELS[design.status]}
            </Badge>
            {design.cylinders.length > 0 ? (
              <Button onClick={() => setRecording(true)}>
                <History className="size-4" />
                Record an event
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="dangerGhost"
                onClick={() => setDeleting(true)}
                title="Delete this design, its cylinders and its files"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          label="Cylinders"
          value={String(design.cylinderCount)}
          /*
           * What the job says it needs against what has been registered. A set
           * of four where the job expects six is two cylinders unaccounted for —
           * exactly what the register exists to surface.
           */
          note={short ? `job expects ${design.expectedCylinders}` : undefined}
        />
        <Card
          label="Owner"
          value={
            design.ownership === null
              ? '—'
              : design.ownership === 'MIXED'
                ? 'Mixed'
                : OWNERSHIP_LABELS[design.ownership]
          }
        />
        <Card label="Set cost" value={design.totalCost > 0 ? formatRs(design.totalCost) : '—'} />
        <Card
          label="Stored in"
          value={design.locations.length > 0 ? design.locations.join(', ') : '—'}
        />
      </div>

      {/*
       * Above the cylinders, because the artwork is what a design *is* — the
       * cylinders are how it gets printed. Someone opening a design is
       * usually here to look at the file.
       */}
      <div className="mt-8">
        <ArtworkPanel jobId={design.jobId} canEdit={canEdit} cylinderCount={design.cylinderCount} />
      </div>

      <h2 className="text-ink-900 mt-8 mb-3 text-base font-semibold">Cylinders</h2>
      {design.cylinders.length === 0 ? (
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="No cylinders registered"
            description="This design has none on record. Register a set from the main screen."
          />
        </section>
      ) : (
        <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Number</th>
                  <th className="px-4 py-3 font-semibold">Colour</th>
                  <th className="px-4 py-3 font-semibold">Where</th>
                  <th className="px-4 py-3 font-semibold">Owner</th>
                  <th className="px-4 py-3 text-right font-semibold">Repeat</th>
                  <th className="px-4 py-3 text-right font-semibold">Cost</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {design.cylinders.map((cylinder) => (
                  <tr
                    key={cylinder.id}
                    onClick={() => setFocused(focused === cylinder.id ? null : cylinder.id)}
                    className={cn(
                      'border-ink-100 hover:bg-ink-25 cursor-pointer border-b',
                      focused === cylinder.id && 'bg-brand-50/50',
                    )}
                  >
                    <td className="text-ink-900 px-4 py-3 font-medium">{cylinder.code}</td>
                    <td className="text-ink-600 px-4 py-3">
                      {cylinder.colour === 'NA' ? '—' : cylinder.colour}
                    </td>
                    <td className="text-ink-500 px-4 py-3 text-xs">
                      {cylinder.location === 'NA' ? '—' : cylinder.location}
                    </td>
                    <td className="text-ink-500 px-4 py-3 text-xs">
                      {OWNERSHIP_LABELS[cylinder.ownership]}
                    </td>
                    <td className="text-ink-600 px-4 py-3 text-right tabular-nums">
                      {cylinder.circumferenceMm
                        ? `${formatNumber(cylinder.circumferenceMm, 0)} mm`
                        : '—'}
                    </td>
                    <td className="text-ink-900 px-4 py-3 text-right tabular-nums">
                      {cylinder.cost ? formatRs(cylinder.cost) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[cylinder.status]}>
                        {CYLINDER_STATUS_LABELS[cylinder.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink-900 text-base font-semibold">
          {focusedCylinder ? `History — ${focusedCylinder.code}` : 'History — the whole set'}
        </h2>
        {focused ? (
          <button
            type="button"
            onClick={() => setFocused(null)}
            className="text-brand-600 hover:text-brand-700 cursor-pointer text-xs underline underline-offset-2"
          >
            Show the whole set
          </button>
        ) : (
          <span className="text-ink-400 text-xs">Pick a cylinder above to narrow this</span>
        )}
      </div>

      {events.length === 0 ? (
        <section className="border-ink-200 rounded-[var(--radius-lg)] border bg-white">
          <EmptyState
            title="Nothing recorded yet"
            description="Events appear here as they happen."
          />
        </section>
      ) : (
        <section className="border-ink-200 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Cylinder</th>
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 font-semibold">For</th>
                  <th className="px-4 py-3 font-semibold">Remarks</th>
                  <th className="px-4 py-3 font-semibold">By</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-ink-100 border-b">
                    <td className="text-ink-500 px-4 py-3 tabular-nums whitespace-nowrap">
                      {formatDate(event.occurredOn)}
                    </td>
                    <td className="text-ink-800 px-4 py-3">{event.cylinderCode}</td>
                    <td className="text-ink-800 px-4 py-3">
                      {CYLINDER_EVENT_LABELS[event.kind]}
                      {event.kind === 'TRANSFERRED' ? (
                        <span className="text-ink-400 block text-xs">
                          {event.fromLocation || '—'} → {event.toLocation}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink-500 px-4 py-3 text-xs">{event.reference || '—'}</td>
                    <td className="text-ink-500 px-4 py-3 text-xs">{event.notes || '—'}</td>
                    <td className="text-ink-400 px-4 py-3 text-xs">{event.enteredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <DeleteDesignModal
        open={deleting}
        onClose={() => setDeleting(false)}
        jobId={design.jobId}
        jobName={design.jobName}
        onDeleted={() => navigate('/cylinders', { replace: true })}
      />

      <RecordEventModal
        cylinders={design.cylinders}
        open={recording}
        onClose={() => setRecording(false)}
      />
    </div>
  );
}

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-ink-200 rounded-[var(--radius-lg)] border bg-white px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="text-ink-900 text-lg font-bold tabular-nums">{value}</div>
      <div className="text-ink-500 mt-0.5 text-xs">
        {label}
        {note ? <span className="text-warning-600 block">{note}</span> : null}
      </div>
    </div>
  );
}
