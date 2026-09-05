# UI primitives

Generic, feature-agnostic building blocks: Button, Input, **NumberInput**,
Select, Combobox, Field, Modal, Badge, Toaster, EmptyState, ReadOnlyValue,
Spinner, LoadingState.

Rules: no business logic, no data fetching, no feature imports. Style with the
design tokens in `src/styles/index.css` (`bg-brand-600`, `text-ink-500`, …)
rather than raw hex values.

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
