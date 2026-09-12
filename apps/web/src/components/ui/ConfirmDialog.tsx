import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * Asks before something that cannot be undone by pressing the same button again.
 *
 * Retiring a machine or a wage is one click and reaches the server immediately,
 * and it moves the rate on every quotation costed afterwards — a press removed
 * from the costing makes every job look cheaper to make than it is, quietly and
 * at once. Deactivating a user is the same shape: one click, and somebody is
 * locked out.
 *
 * **Only the destructive direction asks.** Restoring what was retired is the
 * inverse, and putting a dialog in front of it teaches the office to click
 * through dialogs — which is how the dangerous one gets clicked through too.
 *
 * Cancel is focused when the dialog opens, so Enter on a dialog nobody read
 * does nothing. Deleting is deliberate: it takes reading the sentence.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  onConfirm,
  onClose,
  loading = false,
  tone = 'danger',
  children,
}: {
  open: boolean;
  title: string;
  /** What the button does, in the words of the thing itself — "Retire", not "OK". */
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
  tone?: 'danger' | 'primary';
  /** What happens, and what it costs. One or two sentences. */
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {/* First in the DOM, so the focus trap lands here rather than on the
              button that does the thing. */}
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-ink-600 text-sm leading-relaxed">{children}</div>
    </Modal>
  );
}
