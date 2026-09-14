# UI primitives

Generic, feature-agnostic building blocks: Button, Input, **NumberInput**,
Select, Combobox, Field, Modal, **ConfirmDialog**, Badge, Toaster, EmptyState,
ReadOnlyValue, Spinner, LoadingState.

Rules: no business logic, no data fetching, no feature imports. Style with the
design tokens in `src/styles/index.css` (`bg-brand-600`, `text-ink-500`, …)
rather than raw hex values.

> **A shade with no token generates no CSS, and says nothing about it.** Tailwind
> v4 builds its utilities from `@theme`, so `text-danger-750` is not an error —
> it is a class that does nothing, in a file that reads as though it does. The
> ramps in `index.css` run 50 to 900 for exactly that reason, and
> `styles/theme-tokens.test.ts` fails the build on any class naming a shade that
> is not there.

## `ConfirmDialog` asks before something that cannot be clicked back

For anything that reaches the server on one click and is not undone by pressing
the same button again — Retire on a machine or a wage, Deactivate on a user,
Delete on a material or a supplier.

Two rules, both tested, because both are easy to lose in a refactor:

- **The button carries the verb.** `confirmLabel="Retire"`, never "OK". A person
  skimming reads the button, not the sentence.
- **Cancel is first in the DOM**, so the focus trap lands on the safe control and
  Enter on a dialog nobody read does nothing.

Say what it costs rather than "Are you sure?" — retiring a press takes its power
and its people out of the costing, so every rate worked out afterwards drops.
That is worth a sentence; "this cannot be undone" is not, especially when it can.

**Say it in figures where there are figures.** Deleting a material from Inventory
reads "250 KG is on the books across 1 batch. Deleting the material takes those
batches and every movement against them with it" — a quantity the office can
weigh against what is on the shelf, not an abstraction. The same dialog says so
honestly when nothing is held.

**Only the destructive direction should use it.** Restore is the inverse and
should go straight through: a dialog in front of a safe action is how people
learn to click through the dangerous one.

## `Combobox` options can carry a key

Pass plain strings when the text _is_ the identity, and `ComboboxOption`
(`{ key, label, description? }`) when it is not. `onPick(label, key)` hands both
back.

The second form exists because two of this works' designs share a name **and** a
job code — the source spreadsheet reuses codes across genuinely different jobs.
Keyed on what is written, the picker would answer with the first match for both,
and a cylinder set would be registered against the wrong job with nothing on
screen to show it. `description` is the second line that lets a person tell such
a pair apart.

It takes either a react-hook-form `registration` **or** a plain `onChange`, not
both: `register` owns the input through a ref, so also setting `value` would
give one field two owners.

## Anything numeric uses `NumberInput`

Not `Input`, and not `type="number"`. Two reasons, and both are behaviour the
office would otherwise meet on one screen and not the next:

- `type="number"` reports an **empty string** for anything it cannot parse, so a
  stray letter takes the whole figure with it. `NumberInput` stays `type="text"`
  with a numeric keypad and **refuses** the keystroke instead — nothing
  happening reads as "that key does not belong here", where a character
  vanishing as it is typed reads as a broken keyboard. It also avoids the
  spinner arrows, which change a quantity when the page is scrolled with the
  cursor over the box.
- It **selects its contents on focus**, so a field defaulted to `0` has that
  zero replaced by the first keystroke rather than prefixed. Typing 210 into a
  box showing 0 was leaving `0210`.

`allowNegative` opts into a minus sign. Nothing uses it today — every figure in
the app is zero-or-more — but the distinction is real and belongs with the
component rather than being rediscovered the first time something can go
negative.

## Rows of fields align at the top

`items-start`, not `items-end`. A hint under one field makes that column taller,
and aligning by the bottom then floats that field's input above the rest of the
row. Every label in these rows is a single line, so aligning the tops aligns the
inputs; a trailing icon button needs a label-height spacer to land level with
them.
