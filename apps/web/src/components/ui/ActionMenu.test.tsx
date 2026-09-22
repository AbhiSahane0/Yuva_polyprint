import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionMenu } from './ActionMenu';

/**
 * **A menu that will not close is a trap**, and on a touch screen there is no
 * Escape key to fall back on. So all three ways out are pinned: choosing
 * something, tapping away, and the button itself.
 *
 * The last one is the one that broke first. A `click` listener on the document
 * fires AFTER the button has already toggled the menu open again, so tapping
 * the button to close it closed and reopened it in one gesture and the menu
 * never shut. It listens on `pointerdown` for that reason.
 */
const ACTIONS = [
  { label: 'Mark in production', onSelect: vi.fn() },
  { label: 'Cancel order', onSelect: vi.fn(), danger: true },
];

const menu = () => screen.queryByRole('menu');
const trigger = () => screen.getByRole('button', { name: 'More actions' });

describe('ActionMenu', () => {
  it('starts closed, because a menu that is always open is a list', () => {
    render(<ActionMenu actions={ACTIONS} />);
    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on the button and lists every action', () => {
    render(<ActionMenu actions={ACTIONS} />);
    fireEvent.click(trigger());
    expect(menu()).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Mark in production' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Cancel order' })).toBeTruthy();
  });

  it('runs the action and closes', () => {
    const onSelect = vi.fn();
    render(<ActionMenu actions={[{ label: 'Do it', onSelect }]} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Do it' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
  });

  it('closes on the button itself, rather than flickering shut and open', () => {
    render(<ActionMenu actions={ACTIONS} />);
    fireEvent.click(trigger());
    expect(menu()).not.toBeNull();
    fireEvent.pointerDown(trigger());
    fireEvent.click(trigger());
    expect(menu()).toBeNull();
  });

  it('closes on a tap outside', () => {
    render(<ActionMenu actions={ACTIONS} />);
    fireEvent.click(trigger());
    fireEvent.pointerDown(document.body);
    expect(menu()).toBeNull();
  });

  it('closes on Escape', () => {
    render(<ActionMenu actions={ACTIONS} />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu()).toBeNull();
  });

  it('renders nothing at all when there is nothing to do', () => {
    // A completed order has no actions left. A button opening an empty sheet
    // is worse than no button.
    const { container } = render(<ActionMenu actions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('marks the destructive one, and it is the only one marked', () => {
    render(<ActionMenu actions={ACTIONS} />);
    fireEvent.click(trigger());
    const cancel = screen.getByRole('menuitem', { name: 'Cancel order' });
    const other = screen.getByRole('menuitem', { name: 'Mark in production' });
    expect(cancel.className).toContain('text-danger-600');
    expect(other.className).not.toContain('text-danger');
  });
});
