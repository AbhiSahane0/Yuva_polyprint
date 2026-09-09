import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NumberInput } from './Field';

/**
 * A box that only takes a number, and does not fight you over a leading zero.
 *
 * Both behaviours are the kind that read as a broken keyboard when they are
 * wrong: a letter that lands and erases the figure, or a default `0` that turns
 * 210 into 0210.
 */
function Host({
  initial = '',
  allowNegative = false,
}: {
  initial?: string;
  allowNegative?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberInput
      id="figure"
      aria-label="Figure"
      allowNegative={allowNegative}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

const box = () => screen.getByLabelText('Figure') as HTMLInputElement;

describe('NumberInput', () => {
  it('takes digits and one decimal point', () => {
    render(<Host />);
    fireEvent.change(box(), { target: { value: '1250.75' } });
    expect(box().value).toBe('1250.75');
  });

  it('refuses letters rather than swallowing the figure', () => {
    /*
     * `type="number"` reports "" for anything it cannot parse, so a stray
     * letter takes the whole number with it. Refusing the keystroke leaves what
     * was already typed alone.
     */
    render(<Host initial="1250" />);
    fireEvent.change(box(), { target: { value: '1250a' } });
    expect(box().value).toBe('1250');
  });

  it('refuses a second decimal point', () => {
    render(<Host initial="12.5" />);
    fireEvent.change(box(), { target: { value: '12.5.5' } });
    expect(box().value).toBe('12.5');
  });

  it('refuses a minus sign unless negatives are allowed', () => {
    // Quantities and rates cannot be negative; a stock adjustment can.
    render(<Host initial="" />);
    fireEvent.change(box(), { target: { value: '-5' } });
    expect(box().value).toBe('');
  });

  it('takes a minus sign where negatives are allowed', () => {
    render(<Host initial="" allowNegative />);
    fireEvent.change(box(), { target: { value: '-36' } });
    expect(box().value).toBe('-36');
  });

  it('selects what is there on focus, so a default 0 is replaced not prefixed', () => {
    /*
     * The reported problem. A field showing 0 is one somebody types into, and
     * without this, typing 210 leaves 0210 — which is a different number and
     * looks like a fault in the keyboard.
     */
    render(<Host initial="0" />);
    const select = vi.spyOn(box(), 'select');
    fireEvent.focus(box());
    expect(select).toHaveBeenCalled();
  });

  it('stays a text box, so a bad keystroke cannot empty it', () => {
    // The reason it is not type="number". Also avoids spinner arrows, which
    // change a quantity when the page is scrolled with the cursor over it.
    render(<Host initial="1250" />);
    expect(box().getAttribute('type')).toBe('text');
    expect(box().getAttribute('inputMode')).toBe('decimal');
  });

  it('accepts an empty box, so a figure can be cleared', () => {
    render(<Host initial="1250" />);
    fireEvent.change(box(), { target: { value: '' } });
    expect(box().value).toBe('');
  });
});

describe('NumberInput and the DOM', () => {
  it('keeps `invalid` out of the markup', () => {
    /*
     * It reads the prop for the border and for aria-invalid, and used to
     * forward it as well — React then warned on every render of every number
     * box on the quotation screen, which is most of them, and buried anything
     * else in the console.
     */
    render(<NumberInput aria-label="rate" invalid={false} defaultValue="1" />);
    const input = screen.getByLabelText('rate');
    expect(input.hasAttribute('invalid')).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('still marks a refused value for a screen reader', () => {
    render(<NumberInput aria-label="rate" invalid defaultValue="1" />);
    expect(screen.getByLabelText('rate').getAttribute('aria-invalid')).toBe('true');
  });
});
