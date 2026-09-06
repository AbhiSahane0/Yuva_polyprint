import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Combobox, type ComboboxOption } from './Combobox';

/**
 * The property worth pinning: **an option's text is not its identity**.
 *
 * Two of this works' designs share a name *and* a job code, because the source
 * spreadsheet reuses codes. A picker keyed on what is written would return the
 * first match for both, and a cylinder set would be registered against the
 * wrong job with nothing on screen to show it.
 */

/** A controlled host, as the register-a-set dialog is. */
function Host({
  options,
  onPick,
}: {
  options: readonly string[] | readonly ComboboxOption[];
  onPick: (label: string, key: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <Combobox
      id="thing"
      options={options}
      value={value}
      onChange={setValue}
      onPick={(label, key) => {
        setValue(label);
        onPick(label, key);
      }}
    />
  );
}

const box = () => screen.getByRole('combobox') as HTMLInputElement;

describe('Combobox', () => {
  it('returns the key of the option picked, not its text', () => {
    const picked = vi.fn();
    const options: ComboboxOption[] = [
      { key: 'job_a', label: 'Cholke Paneer 200gm.', description: 'Cholke · YPP2605224' },
      { key: 'job_b', label: 'Cholke Paneer 200gm.', description: 'Cholke · YPP2605224' },
    ];
    render(<Host options={options} onPick={picked} />);

    fireEvent.focus(box());
    /* Both rows read identically, so only position tells them apart. */
    const rows = screen.getAllByRole('option');
    expect(rows).toHaveLength(2);

    fireEvent.mouseDown(rows[1]!);
    expect(picked).toHaveBeenCalledWith('Cholke Paneer 200gm.', 'job_b');
  });

  it('still treats a plain string as its own key', () => {
    const picked = vi.fn();
    render(<Host options={['Cyan', 'Magenta']} onPick={picked} />);

    fireEvent.focus(box());
    fireEvent.mouseDown(screen.getByRole('option', { name: /Magenta/ }));
    expect(picked).toHaveBeenCalledWith('Magenta', 'Magenta');
  });

  it('drives the input from `value` when there is no form registration', () => {
    /*
     * The uncontrolled path belongs to react-hook-form, which owns the input
     * through a ref. Setting `value` there as well would give one field two
     * owners; this asserts the controlled half works without it.
     */
    render(<Host options={['Cyan', 'Magenta']} onPick={vi.fn()} />);

    fireEvent.change(box(), { target: { value: 'Mag' } });
    expect(box().value).toBe('Mag');

    fireEvent.mouseDown(screen.getByRole('option', { name: /Magenta/ }));
    expect(box().value).toBe('Magenta');
  });

  it('narrows the list as you type, and shows every option again on an exact match', () => {
    render(<Host options={['Cyan', 'Magenta', 'Yellow']} onPick={vi.fn()} />);

    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: 'ell' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);

    /* Typed the whole thing — the alternatives come back rather than vanish. */
    fireEvent.change(box(), { target: { value: 'Yellow' } });
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('picks with the keyboard', () => {
    const picked = vi.fn();
    render(
      <Host
        options={[
          { key: 'a', label: 'Alpha' },
          { key: 'b', label: 'Beta' },
        ]}
        onPick={picked}
      />,
    );

    fireEvent.focus(box());
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(picked).toHaveBeenCalledWith('Beta', 'b');
  });
});
