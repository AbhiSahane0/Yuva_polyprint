import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Download, FileText, X } from 'lucide-react';
import { formatNumber, formatRs, type PublicQuotation } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Logo } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/Spinner';
import { ApiClientError } from '@/lib/api-client';
import { saveBlob } from '@/lib/download';
import {
  fetchPublicQuotationPdf,
  usePublicQuotation,
  useRespondToQuotation,
} from '../api/public-quotation-api';

/**
 * **The one page in this app a customer sees.**
 *
 * Everything else here is for the works. This is for the person at the other
 * end of a quotation, on a phone, who has never used the system and never
 * will — so it is a single column, it says what it is before it says anything
 * else, and the two things they can do are the two largest things on it.
 *
 * It is deliberately not the PDF. The PDF is attached and downloadable and is
 * still the document; this is the covering page that lets them answer it, so
 * it shows the figures they will check — what, how much, how many, and the
 * advance — and leaves the specification to the file.
 */

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ink-50 min-h-dvh px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 text-center">
          <Logo className="mx-auto mb-3 h-10" />
          <p className="text-ink-900 text-sm font-bold">Yuva Polyprint &amp; Packaging</p>
          <p className="text-ink-500 text-xs">Sangamner, Ahmednagar</p>
        </div>
        {children}
        <p className="text-ink-400 mt-8 text-center text-xs">
          Questions about this quotation? Reply to the email it came with and the office will pick
          it up.
        </p>
      </div>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border-ink-200 rounded-[var(--radius-lg)] border bg-white ${className}`}>
      {children}
    </div>
  );
}

export default function PublicQuotationPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { data, isLoading, error, refetch } = usePublicQuotation(token);

  if (isLoading) {
    return (
      <Shell>
        <Card className="flex items-center justify-center gap-3 p-10">
          <Spinner />
          <span className="text-ink-500 text-sm">Fetching your quotation…</span>
        </Card>
      </Shell>
    );
  }

  /*
   * One state for every reason a link will not open — expired, withdrawn,
   * superseded, never existed. The server decides which sentence to show; the
   * page does not try to tell them apart, because the customer's next step is
   * the same in all four.
   */
  if (error || !data) {
    return (
      <Shell>
        <Card className="p-8 text-center">
          <p className="text-ink-900 text-base font-semibold">This link will not open</p>
          <p className="text-ink-600 mx-auto mt-2 max-w-md text-sm">
            {error instanceof ApiClientError
              ? error.message
              : 'We could not fetch this quotation. Please check the link, or get in touch with the office.'}
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <QuotationBody quotation={data} token={token} onAnswered={() => void refetch()} />
    </Shell>
  );
}

function QuotationBody({
  quotation,
  token,
  onAnswered,
}: {
  quotation: PublicQuotation;
  token: string;
  onAnswered: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await fetchPublicQuotationPdf(token);
      saveBlob(blob, filename ?? `Quotation_${quotation.number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-ink-400 text-xs font-semibold tracking-wide uppercase">Quotation</p>
            <h1 className="text-ink-900 text-2xl font-bold">
              #{quotation.number}
              {quotation.version > 1 ? (
                <span className="text-ink-400 ml-2 text-base font-medium">
                  rev {quotation.version}
                </span>
              ) : null}
            </h1>
            <p className="text-ink-600 mt-1 text-sm">
              For <span className="font-semibold">{quotation.customerName}</span>
              {quotation.title ? ` — ${quotation.title}` : ''}
            </p>
            <p className="text-ink-400 mt-0.5 text-xs">Dated {formatDate(quotation.date)}</p>
          </div>

          <Button variant="secondary" onClick={() => void onDownload()} disabled={downloading}>
            {downloading ? <Spinner size="sm" /> : <Download className="size-4" />}
            Full PDF
          </Button>
        </div>
      </Card>

      <Card>
        <div className="border-ink-100 flex items-center gap-2 border-b px-5 py-3">
          <FileText className="text-ink-400 size-4" />
          <h2 className="text-ink-800 text-sm font-semibold">
            {quotation.items.length} job{quotation.items.length === 1 ? '' : 's'}
          </h2>
        </div>

        {/* A list of blocks, not a table. Seven columns on a phone is six
            columns of nothing, and this is read on a phone. */}
        <ul className="divide-ink-100 divide-y">
          {quotation.items.map((item) => {
            const perPouch = item.pricingBasis === 'PER_POUCH';
            return (
              <li key={item.position} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-ink-900 font-semibold">{item.jobName}</p>
                  <p className="text-ink-900 font-semibold tabular-nums">
                    {formatRs(item.totalAmount)}
                  </p>
                </div>
                <p className="text-ink-500 mt-0.5 text-sm">
                  {item.description} · {formatNumber(item.widthMm)} × {formatNumber(item.heightMm)}{' '}
                  mm · {formatNumber(item.micron)}µ · {item.colours} colour
                  {item.colours === 1 ? '' : 's'}
                </p>
                <p className="text-ink-500 mt-1 text-sm tabular-nums">
                  {perPouch
                    ? `${formatNumber(item.quantityPouches)} pcs at ${formatRs(item.ratePerPouch, 2)} each`
                    : `${formatNumber(item.quantityKg)} kg at ${formatRs(item.ratePerKg, 2)} per kg`}
                  {item.cylinderCost > 0 ? ` · cylinders ${formatRs(item.cylinderCost)}` : ''}
                </p>
              </li>
            );
          })}
        </ul>

        <dl className="border-ink-100 bg-ink-50/60 space-y-1.5 border-t px-5 py-4 text-sm">
          <Row label="Material" value={formatRs(quotation.materialSubtotal)} />
          {quotation.cylinderSubtotal > 0 ? (
            <Row label="Cylinders" value={formatRs(quotation.cylinderSubtotal)} />
          ) : null}
          <Row label="Subtotal" value={formatRs(quotation.grandSubtotal)} />
          <Row
            label={`GST at ${formatNumber(quotation.gstPercent)}%`}
            value={formatRs(quotation.grandWithGst - quotation.grandSubtotal)}
          />
          <div className="border-ink-200 mt-2 flex items-baseline justify-between border-t pt-2.5">
            <dt className="text-ink-900 font-semibold">Total</dt>
            <dd className="text-ink-900 text-lg font-bold tabular-nums">
              {formatRs(quotation.grandWithGst)}
            </dd>
          </div>
          <Row label="Advance payable" value={formatRs(quotation.totalAdvance)} />
        </dl>
      </Card>

      {quotation.terms.length > 0 ? (
        <Card className="px-5 py-4">
          <h2 className="text-ink-800 mb-2 text-sm font-semibold">Terms</h2>
          <ul className="text-ink-600 list-inside list-disc space-y-1 text-sm">
            {quotation.terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
          {quotation.notes ? (
            <p className="text-ink-600 mt-3 text-sm whitespace-pre-line">{quotation.notes}</p>
          ) : null}
        </Card>
      ) : null}

      {quotation.response ? (
        <AnsweredCard quotation={quotation} />
      ) : (
        <AnswerForm token={token} onAnswered={onAnswered} expiresAt={quotation.expiresAt} />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-600">{label}</dt>
      <dd className="text-ink-800 tabular-nums">{value}</dd>
    </div>
  );
}

/** What they see once the answer is in — theirs, or a colleague's. */
function AnsweredCard({ quotation }: { quotation: PublicQuotation }) {
  const response = quotation.response!;
  const accepted = response.decision === 'ACCEPTED';

  return (
    <Card className={accepted ? 'border-success-500/40' : ''}>
      <div className="px-6 py-6 text-center">
        <div
          className={`mx-auto mb-3 flex size-11 items-center justify-center rounded-full ${
            accepted ? 'bg-success-50 text-success-600' : 'bg-ink-100 text-ink-500'
          }`}
        >
          {accepted ? <Check className="size-6" /> : <X className="size-6" />}
        </div>

        <p className="text-ink-900 text-base font-semibold">
          {accepted ? 'This quotation has been accepted' : 'This quotation was declined'}
        </p>
        <p className="text-ink-600 mt-1 text-sm">
          By {response.personName}
          {response.personRole ? `, ${response.personRole}` : ''} on{' '}
          {new Date(response.respondedAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          .
        </p>
        {response.note ? (
          <p className="text-ink-600 border-ink-200 mx-auto mt-3 max-w-md border-l-2 pl-3 text-left text-sm">
            {response.note}
          </p>
        ) : null}

        {accepted ? (
          <p className="text-ink-500 mt-4 text-sm">
            Thank you. Our office will be in touch about the schedule and the advance.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

type Mode = 'idle' | 'ACCEPTED' | 'DECLINED';

function AnswerForm({
  token,
  onAnswered,
  expiresAt,
}: {
  token: string;
  onAnswered: () => void;
  expiresAt: string;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [personName, setPersonName] = useState('');
  const [personRole, setPersonRole] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const respond = useRespondToQuotation(token);
  const accepting = mode === 'ACCEPTED';

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === 'idle') return;
    setError(null);

    respond.mutate(
      { decision: mode, personName, personRole, note },
      {
        onSuccess: onAnswered,
        onError: (cause) =>
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : 'That did not go through. Please try again, or get in touch with the office.',
          ),
      },
    );
  }

  if (mode === 'idle') {
    return (
      <Card className="px-6 py-6 text-center">
        <p className="text-ink-900 text-base font-semibold">Ready to go ahead?</p>
        <p className="text-ink-500 mx-auto mt-1 max-w-md text-sm">
          Accepting tells our office to start work. This link is open until{' '}
          {new Date(expiresAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.
        </p>

        <div className="mt-5 flex flex-col-reverse items-stretch justify-center gap-2 sm:flex-row sm:items-center">
          <Button variant="secondary" onClick={() => setMode('DECLINED')}>
            Not this time
          </Button>
          {/* The larger of the two, and the only one in the brand colour —
              this is the button the page exists for. */}
          <Button className="h-11 px-6 text-base" onClick={() => setMode('ACCEPTED')}>
            <Check className="size-4" />
            Accept this quotation
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="px-6 py-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <p className="text-ink-900 text-base font-semibold">
            {accepting ? 'Accept this quotation' : 'Decline this quotation'}
          </p>
          <p className="text-ink-500 mt-1 text-sm">
            {accepting
              ? 'So that we know who to thank, and who agreed to it.'
              : 'A line about why helps us quote you better next time.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="personName" required>
            <Input
              id="personName"
              autoComplete="name"
              autoFocus
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="Sunil Kale"
            />
          </Field>
          <Field label="Your role" htmlFor="personRole" hint="Optional">
            <Input
              id="personRole"
              value={personRole}
              onChange={(event) => setPersonRole(event.target.value)}
              placeholder="Purchase"
            />
          </Field>
        </div>

        <Field
          label={accepting ? 'Anything to tell us?' : 'Why not?'}
          htmlFor="note"
          required={!accepting}
          hint={accepting ? 'Optional' : undefined}
        >
          <Textarea
            id="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              accepting ? 'Please start the cylinders this week.' : 'The rate is above our budget.'
            }
          />
        </Field>

        {error ? <p className="text-danger-600 text-sm">{error}</p> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMode('idle')}
            disabled={respond.isPending}
          >
            Back
          </Button>
          <Button type="submit" loading={respond.isPending}>
            {accepting ? 'Confirm acceptance' : 'Send our answer'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
