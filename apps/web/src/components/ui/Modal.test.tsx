import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';

/**
 * **A dialog must not take the keyboard away from the person using it.**
 *
 * Both rules here were broken at once, and they compounded: typing a lorry's
 * number into a dispatch note moved focus to the close button after the first
 * letter, so the rest of the registration went nowhere.
 *
 * Neither is reachable by a unit test of anything smaller, and neither shows up
 * in an automated pass that sets input values directly — it takes actual
 * keystrokes, which is how it reached a user instead of a test.
 */

/** A dialog driven the way the real ones are: state in the parent, inline arrow. */
function Harness({ withField = true }: { withField?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <Modal
      open
      /* An inline arrow, exactly like every caller in the app. A new identity on
         every render is the whole point of the test. */
      onClose={() => {}}
      title="Send note #2"
      footer={<button type="button">Dispatch it</button>}
    >
      {withField ? (
        <input
          aria-label="Vehicle number"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      ) : (
        <p>Nothing to fill in.</p>
      )}
    </Modal>
  );
}

describe('a dialog that is being typed into', () => {
  it('leaves the focus where the typing is', async () => {
    render(<Harness />);
    const field = screen.getByLabelText('Vehicle number');
    field.focus();

    /*
     * One letter at a time, because that is the failure. Each keystroke
     * re-rendered the parent, which changed the onClose identity, which tore
     * the focus effect down and ran it again — and it put the focus back on the
     * close button.
     */
    for (const letter of 'MH15') {
      fireEvent.change(field, {
        target: { value: `${(field as HTMLInputElement).value}${letter}` },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(document.activeElement).toBe(field);
    }

    expect((field as HTMLInputElement).value).toBe('MH15');
  });

  it('opens with the first field focused, not the close button', async () => {
    render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(screen.getByLabelText('Vehicle number'));
  });

  it('falls back to the footer when there is nothing to fill in', async () => {
    /* What ConfirmDialog relies on: Cancel comes first in the footer, so a
       dialog nobody read does the safe thing on Enter. The close button is
       earlier in the DOM than either, and must not win. */
    render(<Harness withField={false} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dispatch it' }));
  });
});

describe('the basics it promises', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Send note #2">
        <input aria-label="Vehicle number" />
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still closes on Escape after the parent has re-rendered', () => {
    /* The fix keeps onClose in a ref. A stale ref would leave Escape calling
       the handler the dialog opened with, which is the classic way this breaks. */
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Modal open onClose={first} title="Send note #2">
        <input aria-label="Vehicle number" />
      </Modal>,
    );
    rerender(
      <Modal open onClose={second} title="Send note #2">
        <input aria-label="Vehicle number" />
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('locks the background scroll while it is open, and gives it back', () => {
    const { unmount } = render(
      <Modal open onClose={() => {}} title="Send note #2">
        <input aria-label="Vehicle number" />
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('gives the focus back to whatever had it when it closes', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();

    const { unmount } = render(
      <Modal open onClose={() => {}} title="Send note #2">
        <input aria-label="Vehicle number" />
      </Modal>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
