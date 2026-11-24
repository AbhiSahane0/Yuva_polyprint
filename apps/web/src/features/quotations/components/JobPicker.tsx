import { useState } from 'react';
import { Plus, Repeat, Truck, X } from 'lucide-react';
import type { CustomerJob } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { cn } from '@/lib/utils';
import { jobOptions } from '../lib/saved-job';

/**
 * **Which jobs this quotation is for, asked beside the company it is for.**
 *
 * An enquiry arrives as a company and a handful of designs in one breath —
 * "Amol Bhadang 200gm, 500gm and the 1kg, for Amol Foods" — so it is answered
 * here rather than three steps in. One quotation, several lines, and the office
 * knows all of them before it knows anything about any of them.
 *
 * Each job named here becomes a line on the Jobs step. That step prices them
 * and does not name them: a name typed in two places is a name that disagrees
 * with itself, and the one that mattered was whichever got saved last.
 *
 * **They sit in the field as chips rather than in a list below it.** A
 * quotation for six designs is ordinary, and six full-width rows pushed the
 * rest of the customer step off the screen — a field that grows a little is
 * worth more than a field that reads every name at once. The chips are
 * shortened; the whole name is on the chip's tooltip and on the Jobs step,
 * which is where the name is being used.
 */
export function JobPicker({
  jobs,
  lines,
  errorFor,
  onPickSaved,
  onAddNew,
  onRename,
  onRemove,
}: {
  /** The chosen customer's designs. Empty for a company not on record. */
  jobs: CustomerJob[];
  /** The quotation's lines, in the order the Jobs step shows them. */
  lines: {
    jobName: string;
    /**
     * The design this line points at, where it points at one.
     *
     * Only to keep the dropdown from offering the same design twice. It is NOT
     * what makes a line a repeat: stepping past the Jobs step records a new
     * design against the customer, so a brand-new line acquires an id of its
     * own within moments of being named.
     */
    jobId: string | null;
    /** Whether this design's cylinders are already in the works. */
    repeat: boolean;
    /** Whether the customer is bringing the set themselves. */
    ownCylinders: boolean;
  }[];
  /** The message against one line, where the form has refused it. */
  errorFor?: (index: number) => string | undefined;
  onPickSaved: (jobId: string) => void;
  onAddNew: (name: string) => void;
  onRename: (index: number, name: string) => void;
  onRemove: (index: number) => void;
}) {
  /**
   * What is in the box but not yet on the quotation.
   *
   * Its own state rather than a form field. Nothing is decided until it is
   * added, and a half-typed name is not a line — the mistake would be a
   * quotation carrying a job called "Amol Bha".
   */
  const [draft, setDraft] = useState('');

  /** The chip being renamed, if any. A chip is a label until it is clicked. */
  const [editing, setEditing] = useState<number | null>(null);

  /*
   * A design already on the quotation is not offered again.
   *
   * Two lines for one design would be priced twice and sold once, and the
   * second would quietly take the first's cylinder decision with it. Adding the
   * same design at two sizes is a different design and gets its own name.
   */
  const taken = new Set(lines.map((line) => line.jobId).filter(Boolean));
  const offered = jobs.filter((job) => !taken.has(job.id));

  function addDraft() {
    const name = draft.trim();
    if (name === '') return;

    /* Typed, but it is one of theirs — so it brings the whole design rather
       than just the name it happens to match. */
    const matched = offered.find((job) => job.jobName.trim().toLowerCase() === name.toLowerCase());
    if (matched) onPickSaved(matched.id);
    else onAddNew(name);
    setDraft('');
  }

  const chips = lines.map((line, index) => {
    const error = errorFor?.(index);
    const name = line.jobName.trim();
    /*
     * Whether a set is being cut for this line, and if not, why not. Two of
     * the three charge nothing for cylinders and they are not the same thing:
     * one is a set on a shelf here, the other a set that was never the works'
     * to make. The word itself is for the tooltip and the screen reader; the
     * chip has a mark for it, because there is room for a mark.
     */
    const kind = line.repeat
      ? { word: 'Repeat', note: 'already in the works', Icon: Repeat }
      : line.ownCylinders
        ? { word: 'Customer’s set', note: 'brought in, nothing cut', Icon: Truck }
        : { word: 'New design', note: 'a set is cut for it', Icon: null };

    if (editing === index) {
      return (
        <input
          key={index}
          id={`jobLine${index}`}
          autoFocus
          autoComplete="off"
          placeholder="Name this job"
          value={line.jobName}
          size={Math.max(name.length, 12)}
          onChange={(event) => onRename(index, event.target.value)}
          onBlur={() => setEditing(null)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            /* The field around this one adds a job on Enter, and the form
               behind that submits on it. Neither is what this means. */
            event.preventDefault();
            event.stopPropagation();
            setEditing(null);
          }}
          className={cn(
            'text-ink-900 rounded-full border px-2.5 py-0.5 text-xs font-medium',
            'focus:ring-brand-600/30 focus:border-brand-600 focus:ring-2 focus:outline-none',
            error ? 'border-danger-500' : 'border-brand-600',
          )}
        />
      );
    }

    return (
      <span
        key={index}
        /* The whole name, which the chip itself has no room for. */
        title={`${name || 'Unnamed job'} — ${kind.word.toLowerCase()}, ${kind.note}`}
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-1 pl-2',
          'text-xs font-medium',
          error
            ? 'bg-danger-50 text-danger-700'
            : line.repeat || line.ownCylinders
              ? 'bg-brand-50 text-brand-700'
              : 'bg-ink-100 text-ink-600',
        )}
      >
        {kind.Icon ? <kind.Icon className="size-3 shrink-0 opacity-70" aria-hidden /> : null}
        {/*
          Clicking the name renames it here. Renaming a line off one of the
          customer's designs makes it a new design — which is what it is, and
          `nameJob` unlinks it so it is quoted for its own cylinders rather
          than borrowing another design's.
        */}
        <button
          type="button"
          onClick={() => setEditing(index)}
          className="max-w-[11rem] cursor-pointer truncate"
        >
          {name || <span className="italic opacity-70">Unnamed</span>}
        </button>
        <span className="sr-only">{kind.word}</span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={`Remove ${name || `job ${index + 1}`}`}
          title="Take this job off the quotation"
          className="hover:bg-danger-50 hover:text-danger-700 cursor-pointer rounded-full p-0.5"
        >
          <X className="size-3" />
        </button>
      </span>
    );
  });

  const failing = lines.map((_line, index) => errorFor?.(index)).find(Boolean);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <div
          className="min-w-0 flex-1"
          /*
           * Enter adds what has been typed. The field below only swallows the
           * key when it is picking a suggestion, so anything that reaches here
           * is a name the works has not printed before.
           */
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.defaultPrevented) return;
            event.preventDefault();
            addDraft();
          }}
        >
          <Combobox
            id="addJob"
            options={jobOptions(offered)}
            value={draft}
            invalid={Boolean(failing)}
            /* A chevron over an empty list is something to click and be
               disappointed by. */
            showChevron={offered.length > 0}
            placeholder={
              lines.length > 0
                ? 'Add another'
                : offered.length > 0
                  ? 'Pick a design, or type a new one'
                  : 'What this quotation is for'
            }
            chips={chips.length > 0 ? chips : null}
            onChange={setDraft}
            /* The row itself, not its text — two of this works' designs read
               the same. See `jobOptions`. */
            onPick={(_name, key) => {
              onPickSaved(key);
              setDraft('');
            }}
          />
        </div>

        <Button variant="secondary" onClick={addDraft} disabled={draft.trim() === ''}>
          <Plus className="size-4" />
          Add job
        </Button>
      </div>

      {/* The chip it belongs to is already red; this says what is wrong with
          it, and where the one box that fixes it is. */}
      {failing ? (
        <p className="text-danger-600 text-sm">{failing} — click the chip to name it</p>
      ) : null}
    </div>
  );
}
