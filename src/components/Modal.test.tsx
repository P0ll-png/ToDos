/**
 * Modal.test.tsx — the shared dialog a11y contract:
 *  - Escape closes;
 *  - a backdrop (scrim) click closes, a click inside the dialog does not;
 *  - focus moves into the dialog on open and is restored to the opener on close;
 *  - Tab/Shift+Tab are trapped (wrap first<->last) within the dialog;
 *  - the dialog's interactive elements are real <button>s.
 *
 * jsdom does not implement native Tab navigation, so the trap is verified by
 * firing keydown with a known document.activeElement and asserting the handler
 * moves focus to the wrapped end (the handler calls .focus() on preventDefault).
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';

function Dialog({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="t">
      <h2 id="t">Test dialog</h2>
      <button type="button">First</button>
      <button type="button">Second</button>
      <button type="button" onClick={onClose}>
        Last
      </button>
    </div>
  );
}

describe('Modal a11y', () => {
  it('moves focus into the dialog on open', () => {
    render(
      <Modal onClose={() => {}}>
        <Dialog onClose={() => {}} />
      </Modal>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'First' }),
    );
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <Dialog onClose={onClose} />
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop click but not on a click inside the dialog', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal onClose={onClose}>
        <Dialog onClose={onClose} />
      </Modal>,
    );
    // Click inside the dialog: no close.
    fireEvent.mouseDown(screen.getByRole('heading', { name: 'Test dialog' }));
    expect(onClose).not.toHaveBeenCalled();
    // Click the scrim itself: close.
    const scrim = container.querySelector('.modal-scrim') as HTMLElement;
    fireEvent.mouseDown(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab from the last element back to the first', () => {
    render(
      <Modal onClose={() => {}}>
        <Dialog onClose={() => {}} />
      </Modal>,
    );
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('traps Shift+Tab from the first element to the last', () => {
    render(
      <Modal onClose={() => {}}>
        <Dialog onClose={() => {}} />
      </Modal>,
    );
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    first.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Tab',
      shiftKey: true,
    });
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the opener on close', () => {
    function Harness() {
      return (
        <>
          <button type="button" data-testid="opener">
            Open
          </button>
        </>
      );
    }
    const { rerender } = render(<Harness />);
    const opener = screen.getByTestId('opener');
    opener.focus();
    expect(document.activeElement).toBe(opener);

    rerender(
      <>
        <Harness />
        <Modal onClose={() => {}}>
          <Dialog onClose={() => {}} />
        </Modal>
      </>,
    );
    // Focus moved into the dialog.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'First' }),
    );

    // Unmount the modal — focus returns to the opener.
    rerender(<Harness />);
    expect(document.activeElement).toBe(screen.getByTestId('opener'));
  });

  it('renders the dialog actions as real <button> elements', () => {
    render(
      <Modal onClose={() => {}}>
        <Dialog onClose={() => {}} />
      </Modal>,
    );
    for (const name of ['First', 'Second', 'Last']) {
      expect(screen.getByRole('button', { name }).tagName).toBe('BUTTON');
    }
  });
});
