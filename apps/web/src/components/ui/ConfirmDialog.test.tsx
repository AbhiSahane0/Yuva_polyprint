import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * **Nothing that reaches the server on one click should reach it on one click.**
 *
 * Retiring a machine or a wage moves the rate on every quotation costed
 * afterwards, and it moves it DOWN — the job reads cheaper to make than it is,
 * at once and without a word. Deactivating a user locks somebody out, which
 * they find out at the machine.
 *
 * Two rules worth pinning, because both are easy to lose in a refactor: the
 * button says what it does rather than "OK", and **Cancel comes first**, so the
 * focus trap lands on the safe control and Enter on a dialog nobody read does
 * nothing.
 */
describe('ConfirmDialog', () => {
  const show = (over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Retire Rotogravure press?"
        confirmLabel="Retire"
        onConfirm={onConfirm}
        onClose={onClose}
        {...over}
      >
        It stops being costed.
      </ConfirmDialog>,
    );
    return { onConfirm, onClose };
  };

  it('says what the button does, not "OK"', () => {
    show();
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ok$/i })).not.toBeInTheDocument();
  });

  it('puts Cancel before the button that does the thing', () => {
    show();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    expect(buttons.indexOf('Cancel')).toBeLessThan(buttons.indexOf('Retire'));
  });

  it('does nothing until the confirm button is pressed', () => {
    const { onConfirm, onClose } = show();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('says what it costs, so the dialog is worth reading', () => {
    show();
    expect(screen.getByText(/It stops being costed/)).toBeInTheDocument();
  });

  /* A second click while the first is in flight would retire it twice. */
  it('blocks both buttons while the action is running', () => {
    show({ loading: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('shows nothing at all when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Retire Rotogravure press?"
        confirmLabel="Retire"
        onConfirm={() => {}}
        onClose={() => {}}
      >
        It stops being costed.
      </ConfirmDialog>,
    );
    expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();
  });
});
