import { useState } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { BadgeCheck, CircleAlert, Search, TriangleAlert } from 'lucide-react';
import { checkGstin, type GstinLookup } from '@yuva/shared';
import { Field, Input } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useGstinLookup } from '../api/gstin-api';

/**
 * A GSTIN box that knows what a GSTIN is.
 *
 * Two checks, and they are not the same kind of thing.
 *
 * The **format check** runs on every keystroke, offline and free. A GSTIN
 * carries its own check digit, which catches every single-character typo and
 * every adjacent transposition — essentially the whole realistic error space
 * for a number copied off a letterhead. Nothing is spent to run it and nothing
 * has to be working for it to run.
 *
 * The **registry lookup** happens only when the office presses Verify. It costs
 * a credit, so it is never fired on blur, on mount, or on a retry — see the
 * hook. It answers the question the arithmetic cannot: was this number ever
 * issued, to whom, and is it still live.
 *
 * The two fail differently and say so. "That GSTIN has a typo" and "no
 * registration found" send you to different places.
 */
export function GstinField({
  label = 'GST number',
  id = 'gstNumber',
  registration,
  value,
  error,
  onApply,
}: {
  label?: string;
  id?: string;
  registration: UseFormRegisterReturn;
  /** Watched, so the format check and the button track what is typed. */
  value: string;
  /** A validation error from the surrounding form, which wins over ours. */
  error?: string | undefined;
  /**
   * Called when the office chooses to take the registry's answer. Left to the
   * caller because the two forms that use this name their fields differently,
   * and neither should have to pretend to be the other.
   */
  onApply?: ((lookup: GstinLookup) => void) | undefined;
}) {
  const lookup = useGstinLookup();
  const [result, setResult] = useState<GstinLookup | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const check = checkGstin(value);

  /*
   * A blank box is not an error. Registration is not compulsory below the
   * turnover threshold, so plenty of genuine small customers have no GSTIN and
   * the form must not nag them about it.
   */
  const showFormatError = check.problem !== null && check.problem !== 'EMPTY';

  async function onVerify() {
    setFailure(null);
    setResult(null);
    try {
      setResult(await lookup.mutateAsync({ gstin: check.normalized }));
    } catch (cause) {
      setFailure(
        cause instanceof ApiClientError ? cause.message : 'The lookup could not be completed.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={label}
        htmlFor={id}
        // The offline verdict, live. Only once there is something to judge.
        hint={check.valid ? 'Format looks right' : 'Carried onto their quotations'}
        error={error ?? (showFormatError ? check.message : undefined)}
      >
        <div className="flex items-stretch gap-2">
          <Input
            id={id}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="27AIGPH5992Q1ZD"
            maxLength={15}
            invalid={Boolean(error) || showFormatError}
            className={cn(
              'font-mono tracking-wide uppercase',
              check.valid && !error ? 'border-success-500' : '',
            )}
            {...registration}
          />
          <button
            type="button"
            /*
             * Only once the number could possibly exist. Sending a GSTIN that
             * fails its own check digit spends a credit to be told something
             * the browser already worked out for nothing.
             */
            disabled={!check.valid || lookup.isPending}
            onClick={() => void onVerify()}
            title={
              check.valid
                ? 'Look this GSTIN up in the registry'
                : 'Enter a valid GSTIN to look it up'
            }
            className="border-ink-200 text-ink-700 hover:bg-ink-50 focus-visible:ring-brand-500 inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border bg-white px-3 text-sm font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="size-3.5" aria-hidden />
            {lookup.isPending ? 'Checking…' : 'Verify'}
          </button>
        </div>
      </Field>

      {failure ? (
        <p
          role="status"
          className="text-danger-700 bg-danger-50 flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {failure}
        </p>
      ) : null}

      {result ? <LookupResult lookup={result} onApply={onApply} /> : null}
    </div>
  );
}

/** What the registry said, and the one action worth offering about it. */
function LookupResult({
  lookup,
  onApply,
}: {
  lookup: GstinLookup;
  onApply?: ((lookup: GstinLookup) => void) | undefined;
}) {
  /*
   * Anything other than Active is the whole point of having looked. Quoting a
   * cancelled registration is survivable; invoicing one costs the customer
   * their input tax credit, and by then nobody is looking at this screen.
   */
  const active = (lookup.status ?? '').toLowerCase() === 'active';

  const place = [lookup.city, lookup.district, lookup.state, lookup.pincode]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border px-3 py-2.5 text-xs',
        active ? 'border-success-200 bg-success-50/60' : 'border-warning-300 bg-warning-50',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {active ? (
          <BadgeCheck className="text-success-600 size-4 shrink-0" aria-hidden />
        ) : (
          <TriangleAlert className="text-warning-600 size-4 shrink-0" aria-hidden />
        )}
        <span className="text-ink-900 font-semibold">
          {lookup.legalName ?? lookup.tradeName ?? lookup.gstin}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            active ? 'bg-success-100 text-success-800' : 'bg-warning-100 text-warning-800',
          )}
        >
          {lookup.status ?? 'Status unknown'}
        </span>
      </div>

      <dl className="text-ink-600 mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {lookup.tradeName && lookup.tradeName !== lookup.legalName ? (
          <Row label="Trades as" value={lookup.tradeName} />
        ) : null}
        {lookup.constitution ? <Row label="Constitution" value={lookup.constitution} /> : null}
        {lookup.taxpayerType ? <Row label="Taxpayer" value={lookup.taxpayerType} /> : null}
        {lookup.registrationDate ? (
          <Row label="Registered" value={lookup.registrationDate} />
        ) : null}
        {lookup.address ? <Row label="Address" value={lookup.address} /> : null}
        {place ? <Row label="Place" value={place} /> : null}
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {onApply ? (
          <button
            type="button"
            onClick={() => onApply(lookup)}
            className="border-ink-300 text-ink-800 hover:bg-white focus-visible:ring-brand-500 rounded-[var(--radius-sm)] border bg-white/70 px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            Use these details
          </button>
        ) : null}

        {/*
          Where the answer came from. A cached one is free and possibly months
          old — fine for a name, which does not change; worth knowing for a
          status, which does.
        */}
        <span className="text-ink-400 text-[11px]">
          {lookup.fromCache
            ? `From an earlier check on ${new Date(lookup.checkedAt).toLocaleDateString('en-IN')}`
            : 'Checked just now'}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink-400 shrink-0">{label}</dt>
      <dd className="text-ink-700">{value}</dd>
    </div>
  );
}
