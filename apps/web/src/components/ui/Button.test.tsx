import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { Button } from './Button';

/**
 * **`loading` disables on its own.**
 *
 * Three call sites passed `disabled={x}` alongside `loading={x}`, which reads
 * as though the disabling were theirs to do. It is not — the button has always
 * done it — and the duplication is the kind that gets half-removed later,
 * leaving a button that spins and still takes clicks. Pinned here so dropping
 * the redundant prop stays safe.
 */
describe('a button that is working', () => {
  it('refuses clicks while it loads, with no help from the caller', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        New job sheet
      </Button>,
    );
    const button = screen.getByRole('button', { name: /new job sheet/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a spinner', () => {
    const { container } = render(<Button loading>New job sheet</Button>);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('keeps its label, so it does not change width mid-click', () => {
    const { rerender } = render(
      <Button>
        <Plus className="size-4" />
        New job sheet
      </Button>,
    );
    const before = screen.getByRole('button').textContent;
    rerender(
      <Button loading>
        <Plus className="size-4" />
        New job sheet
      </Button>,
    );
    expect(screen.getByRole('button').textContent).toBe(before);
  });

  it('takes clicks again once it is done', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>New job sheet</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
