import { useEffect, useState, type KeyboardEvent } from 'react';
import { Mail, MessageCircle, Plus, Send, X } from 'lucide-react';
import { collectMobiles, formatMobile, normaliseMobile, type QuotationSummary } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useQuotation, useQuotationEmails, useSendQuotation } from '../api/quotation-api';

/** The import put 'NA' in every blank field, so it is not an address. */
function realEmail(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.toUpperCase() === 'NA') return null;
  return trimmed.includes('@') ? trimmed.toLowerCase() : null;
}

/** Lenient on input — the server's schema is what actually decides. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function Chips({
  values,
  onRemove,
  tone = 'brand',
}: {
  values: string[];
  onRemove: (value: string) => void;
  tone?: 'brand' | 'ink';
}) {
  if (values.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className={
            'inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 text-sm ' +
            (tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-600')
          }
        >
          {value}
          <button
            type="button"
            onClick={() => onRemove(value)}
            aria-label={`Remove ${value}`}
            className="hover:bg-brand-100 cursor-pointer rounded-full p-0.5"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * Sends a quotation to one or more addresses, with the PDF attached.
 *
 * Recipients are chips rather than a comma-separated box, so a mistyped address
 * can be removed without re-typing the rest, and so what will actually be sent
 * is visible at a glance rather than hidden in a long string.
 */
export function SendQuotationModal({
  quotation,
  onClose,
}: {
  quotation: QuotationSummary | null;
  onClose: () => void;
}) {
  const open = quotation !== null;
  // The summary in the list has no email on it; the detail does.
  const { data: detail } = useQuotation(quotation?.id ?? null);
  const { data: history } = useQuotationEmails(quotation?.id ?? null);
  const send = useSendQuotation();

  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  /** E.164 throughout — what is stored and what WhatsApp will address. */
  const [mobiles, setMobiles] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [ccDraft, setCcDraft] = useState('');
  const [mobileDraft, setMobileDraft] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset whenever a different quotation is opened, and prefill from it.
  useEffect(() => {
    if (!open) return;
    setTo([]);
    setCc([]);
    setMobiles([]);
    setDraft('');
    setCcDraft('');
    setMobileDraft('');
    setShowCc(false);
    setMessage('');
    setError(null);
    setSubject(
      quotation ? `Quotation #${quotation.number} — Yuva Polyprint & Packaging Industries` : '',
    );
  }, [open, quotation]);

  /*
   * The customer's saved address arrives with the detail, which loads after the
   * modal opens — so this fills it in when it lands rather than on open. It only
   * ever seeds an empty list, so it cannot overwrite what someone has typed.
   */
  const customerEmail = realEmail(detail?.email);
  useEffect(() => {
    if (customerEmail) setTo((current) => (current.length === 0 ? [customerEmail] : current));
  }, [customerEmail]);

  /*
   * The customer's number, from the quotation's own snapshot of it.
   *
   * Null when the record has none, or has something that is not a mobile — one
   * imported row holds a pair of landlines in a single cell, and a chip reading
   * "222394, 222044" would be a number nobody can be reached on.
   */
  const customerMobile = normaliseMobile(detail?.mobile);
  useEffect(() => {
    if (customerMobile)
      setMobiles((current) => (current.length === 0 ? [customerMobile] : current));
  }, [customerMobile]);

  function addFrom(value: string, list: string[], set: (next: string[]) => void): boolean {
    // One paste can carry several addresses; split on the usual separators.
    const parts = value
      .split(/[,;\s]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return true;

    const bad = parts.find((part) => !looksLikeEmail(part));
    if (bad) {
      setError(`"${bad}" does not look like an email address.`);
      return false;
    }
    setError(null);
    set([...new Set([...list, ...parts])]);
    return true;
  }

  /**
   * Commit whatever is in the number box, reporting anything unreadable.
   *
   * Returns false without adding when a number cannot be read, so the office is
   * told rather than left with a chip missing. Silently dropping half a paste
   * is how a recipient goes missing.
   */
  function addMobilesFrom(value: string, list: string[], set: (next: string[]) => void): boolean {
    const { valid, invalid } = collectMobiles(value);
    if (invalid.length > 0) {
      setError(
        `"${invalid[0]}" is not a ten-digit mobile number. WhatsApp cannot reach a landline.`,
      );
      return false;
    }
    if (valid.length === 0) return true;
    setError(null);
    set([...new Set([...list, ...valid])]);
    return true;
  }

  function onMobileKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (mobileDraft.trim() === '') return;
      event.preventDefault();
      if (addMobilesFrom(mobileDraft, mobiles, setMobiles)) setMobileDraft('');
      return;
    }
    if (event.key === 'Backspace' && mobileDraft === '' && mobiles.length > 0) {
      setMobiles(mobiles.slice(0, -1));
    }
  }

  function onKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    value: string,
    setValue: (next: string) => void,
    list: string[],
    set: (next: string[]) => void,
  ) {
    // Enter, comma and Tab all commit — whichever the typist reaches for.
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (value.trim() === '') return;
      event.preventDefault();
      if (addFrom(value, list, set)) setValue('');
      return;
    }
    // Backspace on an empty box takes back the last chip.
    if (event.key === 'Backspace' && value === '' && list.length > 0) {
      set(list.slice(0, -1));
    }
  }

  function onSend() {
    if (!quotation) return;
    // Commit whatever is still sitting in the boxes, so a typed-but-not-entered
    // address is not silently dropped.
    const pendingTo = [...to];
    if (
      draft.trim() &&
      !addFrom(draft, pendingTo, (next) => pendingTo.splice(0, pendingTo.length, ...next))
    )
      return;
    const pendingCc = [...cc];
    if (
      ccDraft.trim() &&
      !addFrom(ccDraft, pendingCc, (next) => pendingCc.splice(0, pendingCc.length, ...next))
    )
      return;

    // A number typed but not committed must not be dropped either.
    const pendingMobiles = [...mobiles];
    if (
      mobileDraft.trim() &&
      !addMobilesFrom(mobileDraft, pendingMobiles, (next) =>
        pendingMobiles.splice(0, pendingMobiles.length, ...next),
      )
    )
      return;

    if (pendingTo.length === 0) {
      setError('Add at least one recipient.');
      return;
    }

    setError(null);
    send.mutate(
      {
        id: quotation.id,
        to: pendingTo,
        cc: pendingCc,
        subject,
        message,
        whatsappTo: pendingMobiles,
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Quotation #${quotation.number} sent to ${result.sentTo.length === 1 ? result.sentTo[0] : `${result.sentTo.length} recipients`}`,
          );
          onClose();
        },
        onError: (cause) =>
          setError(
            cause instanceof ApiClientError ? cause.message : 'The email could not be sent.',
          ),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={quotation ? `Send quotation #${quotation.number}` : 'Send quotation'}
      description={quotation ? `To ${quotation.customerName}, with the PDF attached.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={onSend} loading={send.isPending}>
            <Send className="size-4" />
            {send.isPending ? 'Sending…' : 'Send email'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="To"
          htmlFor="sendTo"
          hint={
            customerEmail
              ? 'Filled in from the customer record. Add more with Enter or a comma.'
              : 'This customer has no saved email. Type an address and press Enter.'
          }
        >
          <Chips values={to} onRemove={(v) => setTo(to.filter((x) => x !== v))} />
          <Input
            id="sendTo"
            type="email"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => onKeyDown(event, draft, setDraft, to, setTo)}
            onBlur={() => {
              if (draft.trim() && addFrom(draft, to, setTo)) setDraft('');
            }}
            placeholder={to.length === 0 ? 'name@company.com' : 'Add another…'}
            autoComplete="off"
          />
        </Field>

        {showCc ? (
          <Field label="Cc" htmlFor="sendCc">
            <Chips values={cc} onRemove={(v) => setCc(cc.filter((x) => x !== v))} tone="ink" />
            <Input
              id="sendCc"
              type="email"
              value={ccDraft}
              onChange={(event) => setCcDraft(event.target.value)}
              onKeyDown={(event) => onKeyDown(event, ccDraft, setCcDraft, cc, setCc)}
              onBlur={() => {
                if (ccDraft.trim() && addFrom(ccDraft, cc, setCc)) setCcDraft('');
              }}
              placeholder="name@company.com"
              autoComplete="off"
            />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setShowCc(true)}
            className="text-brand-700 hover:text-brand-800 flex cursor-pointer items-center gap-1.5 self-start text-sm font-medium"
          >
            <Plus className="size-4" />
            Add Cc
          </button>
        )}

        {/*
         * WhatsApp numbers, recorded now and delivered to once the provider is
         * wired up.
         *
         * Shown here rather than on a screen of its own because it is part of
         * one decision — "send this quotation, to these people" — and asking
         * the same question twice is how the two lists come to disagree.
         */}
        <Field
          label="WhatsApp numbers"
          htmlFor="sendMobiles"
          hint={
            customerMobile
              ? 'Filled in from the customer record. Recorded with this send — WhatsApp delivery is not live yet.'
              : 'This customer has no saved mobile. Recorded with this send — WhatsApp delivery is not live yet.'
          }
        >
          {/*
           * Chips carry the readable form while the state stays E.164, so what
           * is on screen and what is stored can never drift apart.
           */}
          <Chips
            values={mobiles.map(formatMobile)}
            onRemove={(shown) => setMobiles(mobiles.filter((m) => formatMobile(m) !== shown))}
            tone="ink"
          />
          <Input
            id="sendMobiles"
            type="tel"
            inputMode="tel"
            value={mobileDraft}
            onChange={(event) => setMobileDraft(event.target.value)}
            onKeyDown={onMobileKeyDown}
            onBlur={() => {
              if (mobileDraft.trim() && addMobilesFrom(mobileDraft, mobiles, setMobiles))
                setMobileDraft('');
            }}
            placeholder={mobiles.length === 0 ? '9545390337' : 'Add another…'}
            autoComplete="off"
          />
        </Field>

        <Field label="Subject" htmlFor="sendSubject">
          <Input
            id="sendSubject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>

        <Field
          label="Message"
          htmlFor="sendMessage"
          hint="Optional. Appears above the quotation summary in the email."
        >
          <Textarea
            id="sendMessage"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Please find our quotation attached…"
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-700 rounded-[var(--radius-md)] px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        {send.isPending ? (
          <p className="text-ink-500 flex items-center gap-2 text-sm">
            <Spinner size="sm" />
            Building the PDF and sending — this takes a moment.
          </p>
        ) : null}

        {history && history.length > 0 ? (
          <div className="border-ink-200 border-t pt-3">
            <p className="text-ink-700 mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Mail className="size-4" />
              Already sent
            </p>
            <ul className="text-ink-500 flex flex-col gap-1 text-sm">
              {history.slice(0, 4).map((entry) => (
                <li key={entry.id}>
                  {new Date(entry.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  — {entry.to.join(', ')} <span className="text-ink-400">by {entry.sentBy}</span>
                  {/*
                   * Numbers with no timestamp are what the office intended, not
                   * what was delivered. Saying "pending" rather than listing
                   * them plainly keeps the history from implying a message that
                   * never went out.
                   */}
                  {entry.whatsappTo.length > 0 ? (
                    <span className="text-ink-400 ml-1 inline-flex items-center gap-1">
                      <MessageCircle className="size-3.5" aria-hidden />
                      {entry.whatsappTo.map(formatMobile).join(', ')}
                      {entry.whatsappSentAt ? '' : ' (pending)'}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
